import { buildIdf, cosine, tokenize } from "./text";

// Text similarity for semantic retrieval.
// Neo4j is not written to (no stored vectors / vector index needed): texts are embedded on demand through the
// NVIDIA OpenAI-compatible embeddings endpoint that the app already uses for chat, and cached in memory.
// If that call fails, a TF-IDF cosine over the same texts is used and the method is reported, never hidden.

export type SimilarityMethod = "embedding" | "lexical_tfidf";
export type SimilarityInfo = { method: SimilarityMethod; model?: string; texts: number; cache_hits: number; fallback_reason?: string };

const cache = new Map<string, number[]>();
const CACHE_MAX = 5000;
const BATCH = 32;
const EMBED_TIMEOUT_MS = 10_000;

export const embeddingModel = () => process.env.NVIDIA_EMBEDDING_MODEL?.trim() || "nvidia/nv-embedqa-e5-v5";

async function embed(texts: string[], inputType: "query" | "passage", info: SimilarityInfo): Promise<number[][]> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured.");
  const base = (process.env.NVIDIA_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const model = embeddingModel();
  const result: (number[] | undefined)[] = texts.map((t) => cache.get(`${model}|${inputType}|${t}`));
  info.cache_hits += result.filter(Boolean).length;
  const missing = result.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  const batches: number[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  await Promise.all(batches.map(async (idx) => {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, input: idx.map((i) => texts[i]), encoding_format: "float", truncate: "END",
        ...(process.env.NVIDIA_EMBEDDING_INPUT_TYPE === "none" ? {} : { input_type: inputType }),
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Embeddings API returned HTTP ${res.status} for model "${model}": ${(await res.text()).slice(0, 160)}`);
    const data = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    if (!data.data || data.data.length !== idx.length) throw new Error("Embeddings API returned an unexpected number of vectors.");
    for (const d of data.data) {
      const i = idx[d.index];
      result[i] = d.embedding;
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(`${model}|${inputType}|${texts[i]}`, d.embedding);
    }
  }));
  return result as number[][];
}

function dot(a: number[], b: number[]) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

/** Similarity (cosine, clipped to >= 0) between the query and each text, in the same order. */
export async function similarities(query: string, texts: string[]): Promise<{ scores: number[]; info: SimilarityInfo }> {
  const info: SimilarityInfo = { method: "embedding", model: embeddingModel(), texts: texts.length, cache_hits: 0 };
  if (!texts.length) return { scores: [], info };
  try {
    const [[q], docs] = await Promise.all([embed([query], "query", info), embed(texts, "passage", info)]);
    return { scores: docs.map((d) => Math.max(0, dot(q, d))), info };
  } catch (e) {
    const tokens = texts.map(tokenize);
    const idf = buildIdf([...tokens, tokenize(query)]);
    const qt = tokenize(query);
    return {
      scores: tokens.map((t) => cosine(qt, t, idf)),
      info: { method: "lexical_tfidf", texts: texts.length, cache_hits: 0, fallback_reason: e instanceof Error ? e.message : String(e) },
    };
  }
}
