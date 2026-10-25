import type { PipelineId } from "@/lib/pipelines";
import { pipelineConfig, RETRIEVAL_CONFIG } from "./config";
import { loadEvidence } from "./evidence";
import { similarities } from "./embeddings";
import { scoreCandidates, type QueryContext } from "./scoring";
import { buildIdf, cosine, tokenize } from "./text";
import type { EvidenceCause, RankedCause, RetrievalInput, RetrievalResult } from "./types";

// One strategy per pipeline; all share the same evidence loader and scoring function.
//   graph       candidates: causes linked to the defect (MAY_CAUSE)      signals: defect, support
//   contextual  candidates: same                                         signals: defect, component, symptom, support
//   semantic    candidates: every cause, found by text similarity        signals: semantic (cause text + linked case text)
//   hybrid      candidates: union of graph-linked and semantic matches   signals: all five
const STRATEGY: Record<PipelineId, { scope: "defect" | "all"; legacy: boolean; metadata: boolean; semantic: boolean }> = {
  graph: { scope: "defect", legacy: false, metadata: false, semantic: false },
  contextual: { scope: "defect", legacy: true, metadata: true, semantic: false },
  semantic: { scope: "all", legacy: true, metadata: true, semantic: true },
  hybrid: { scope: "all", legacy: true, metadata: true, semantic: true },
};

const norm = (s: string) => tokenize(s).join(" ");

/** Removes repeated cause ids and causes whose text is identical after normalisation (the first one is kept). */
function dedupe(causes: EvidenceCause[]) {
  const kept = new Map<string, { cause: EvidenceCause; dups: string[] }>();
  const byText = new Map<string, string>();
  for (const c of causes) {
    if (kept.has(c.cause_id)) continue;
    const key = norm(c.text);
    const first = key ? byText.get(key) : undefined;
    if (first) { kept.get(first)!.dups.push(c.cause_id); continue; }
    kept.set(c.cause_id, { cause: c, dups: [] });
    if (key) byText.set(key, c.cause_id);
  }
  return [...kept.values()];
}

async function semanticStage(causes: EvidenceCause[], query: string) {
  const items: { key: string; text: string }[] = [];
  const seenCase = new Set<string>();
  for (const c of causes) {
    if (c.text) items.push({ key: `cause:${c.cause_id}`, text: c.text });
    for (const k of c.cases) if (k.text && !seenCase.has(k.case_id)) { seenCase.add(k.case_id); items.push({ key: `case:${k.case_id}`, text: k.text }); }
  }
  // Cheap lexical pre-filter keeps the number of embedded texts bounded on large graphs.
  let skipped = 0, pool = items;
  if (items.length > RETRIEVAL_CONFIG.semantic.maxTexts) {
    const toks = items.map((i) => tokenize(i.text)), qt = tokenize(query), idf = buildIdf([...toks, qt]);
    pool = items.map((it, i) => ({ it, s: cosine(qt, toks[i], idf) })).sort((a, b) => b.s - a.s).slice(0, RETRIEVAL_CONFIG.semantic.maxTexts).map((x) => x.it);
    skipped = items.length - pool.length;
  }
  const { scores, info } = await similarities(query, pool.map((p) => p.text));
  const floor = RETRIEVAL_CONFIG.semantic.floor[info.method];
  const value = (s: number) => Math.max(0, Math.min(1, (s - floor) / (1 - floor)));
  const sim = new Map(pool.map((p, i) => [p.key, value(scores[i])]));

  const out = new Map<string, { cause: number | null; case: number | null; bestCase?: string }>();
  for (const c of causes) {
    let best: { v: number; id: string } | undefined;
    for (const k of c.cases) { const v = sim.get(`case:${k.case_id}`); if (v != null && (!best || v > best.v)) best = { v: v * k.strength, id: k.case_id }; }
    out.set(c.cause_id, { cause: sim.get(`cause:${c.cause_id}`) ?? null, case: best?.v ?? null, bestCase: best?.id });
  }
  return { sims: out, info: { ...info, floor, texts_embedded_or_compared: pool.length, texts_skipped_by_prefilter: skipped } };
}

export async function retrieve(pipeline: PipelineId, input: RetrievalInput): Promise<RetrievalResult> {
  const s = STRATEGY[pipeline];
  const loaded = await loadEvidence({ defectId: input.defect.id, defectLabel: input.defect.label, scope: s.scope, includeLegacy: s.legacy });
  const result = await rank(pipeline, input, loaded.causes);
  result.trace = {
    ...result.trace,
    queries: loaded.queries,
    ...(loaded.warnings.length && { warnings: [...loaded.warnings, ...((result.trace.warnings as string[]) ?? [])] }),
    ...(loaded.defectsInGraph && { note: "No candidate causes found. defects_in_graph lists the Defect nodes that exist.", defects_in_graph: loaded.defectsInGraph }),
  };
  return result;
}

/** Pure ranking over already-loaded evidence (separate from Neo4j so it can be tested). */
export async function rank(pipeline: PipelineId, input: RetrievalInput, loaded: EvidenceCause[]): Promise<RetrievalResult> {
  const s = STRATEGY[pipeline];
  const cfg = pipelineConfig(pipeline);
  const metadata = s.metadata ? input.metadata.trim() : "";
  const deduped = dedupe(loaded);
  const candidates = deduped.map((d) => d.cause);
  const dupsOf = new Map(deduped.map((d) => [d.cause.cause_id, d.dups]));
  const warnings: string[] = [];

  const ctx: QueryContext = { defectId: input.defect.id, metadata };
  let semanticInfo: Record<string, unknown> | undefined;
  if (s.semantic) {
    const query = [input.defect.label, metadata].filter(Boolean).join(". ");
    const sem = await semanticStage(candidates, query);
    ctx.semantic = sem.sims;
    semanticInfo = { query, ...sem.info };
  }

  const { scored, notes } = scoreCandidates(candidates, ctx, cfg, s.metadata);
  warnings.push(...notes);
  const eligible = scored.filter((x) => x.matchedAny && x.score >= cfg.minScore);
  const supportOf = (x: (typeof scored)[number]) => x.signals.find((g) => g.name === "support")?.value ?? 0;
  // Deterministic order: score, then support, then cause_id.
  eligible.sort((a, b) => b.score - a.score || supportOf(b) - supportOf(a) || a.cause.cause_id.localeCompare(b.cause.cause_id));
  const top = eligible.slice(0, input.k);
  if (top.length > 1 && top.every((x) => x.score === top[0].score)) {
    warnings.push("All returned causes have the same score: the graph holds no evidence that separates them, so ties are broken by cause_id.");
  }
  if (top.length < input.k) warnings.push(`Returned ${top.length} of k=${input.k}: only ${eligible.length} candidate(s) had enough evidence (min score ${cfg.minScore}).`);

  const L = RETRIEVAL_CONFIG.limits;
  const causes: RankedCause[] = top.map((x, i) => ({
    cause_id: x.cause.cause_id,
    properties: x.cause.properties,
    rank: i + 1,
    score: x.score,
    evidence: {
      pipeline, origin: x.cause.origin,
      defect_linked: x.cause.defect_ids.includes(input.defect.id),
      signals: x.signals,
      supporting_cases: [...x.cause.cases].sort((a, b) => b.strength - a.strength).slice(0, L.supportingCasesShown)
        .map((k) => ({ case_id: k.case_id, via: k.via, strength: k.strength, defect_match: k.defect_match, summary: k.text.slice(0, 200) })),
      symptoms: x.cause.symptoms.slice(0, L.symptomsShown),
      sources: x.cause.sources.slice(0, L.sourcesShown),
      ...(dupsOf.get(x.cause.cause_id)?.length && { duplicate_ids: dupsOf.get(x.cause.cause_id) }),
    },
  }));

  return {
    causes,
    trace: {
      pipeline, weights: cfg.weights, min_score: cfg.minScore, metadata_used: Boolean(metadata),
      candidates_loaded: loaded.length, candidates_after_dedupe: candidates.length,
      candidates_above_threshold: eligible.length, returned: causes.length,
      ...(semanticInfo && { semantic: semanticInfo }),
      ranking: causes.map((c) => ({ rank: c.rank, cause_id: c.cause_id, score: c.score })),
      ...(warnings.length && { warnings }),
    },
  };
}

/** Plain-text evidence block for the AI explanation: only what was retrieved, nothing else. */
export function evidenceForPrompt(causes: RankedCause[]): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return causes.map((c) => {
    const signals = c.evidence.signals.filter((g) => g.status === "scored" && (g.value ?? 0) > 0).map((g) => `${g.name} ${g.value!.toFixed(2)} (${g.detail})`).join("; ") || "none";
    const cases = c.evidence.supporting_cases.map((k) => `${k.case_id} via ${k.via}: ${clip(k.summary, 120)}`).join(" | ") || "none";
    return `${c.rank}. [${c.cause_id}] relevance ${c.score.toFixed(2)}\n   details: ${clip(JSON.stringify(c.properties), 400)}\n   matched evidence: ${signals}\n   supporting cases: ${cases}`;
  }).join("\n");
}
