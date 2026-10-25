// Small dependency-free text utilities: tokenising and TF-IDF cosine similarity.
const STOP = new Set(("a an and are as at be by for from has have in is it its of on or that the this to was were with near " +
  "no not but into over under per via can may might possible possibly unverified").split(" "));

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export type Idf = Map<string, number>;

export function buildIdf(docs: string[][]): Idf {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return new Map([...df].map(([t, c]) => [t, Math.log((n + 1) / (c + 1)) + 1]));
}

const idfOf = (idf: Idf, t: string) => idf.get(t) ?? Math.log(idf.size + 2) + 1;

function vector(tokens: string[], idf: Idf): Map<string, number> {
  const v = new Map<string, number>();
  for (const t of tokens) v.set(t, (v.get(t) ?? 0) + 1);
  for (const [t, f] of v) v.set(t, f * idfOf(idf, t));
  return v;
}

export function cosine(a: string[], b: string[], idf: Idf): number {
  if (!a.length || !b.length) return 0;
  const va = vector(a, idf), vb = vector(b, idf);
  let dot = 0, na = 0, nb = 0;
  for (const [t, x] of va) { na += x * x; const y = vb.get(t); if (y) dot += x * y; }
  for (const y of vb.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** idf-weighted share of `phrase` tokens that appear in `present`. */
export function coverage(phrase: string[], present: Set<string>, idf: Idf): number {
  let hit = 0, total = 0;
  for (const t of new Set(phrase)) { const w = idfOf(idf, t); total += w; if (present.has(t)) hit += w; }
  return total ? hit / total : 0;
}
