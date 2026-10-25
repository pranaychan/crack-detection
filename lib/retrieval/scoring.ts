import { RETRIEVAL_CONFIG, type PipelineConfig } from "./config";
import { buildIdf, coverage, cosine, tokenize, type Idf } from "./text";
import type { EvidenceCause, SignalName, SignalResult } from "./types";

// Interpretable scoring. Every signal is 0..1 or null (candidate has no data for it).
//   score = sum(weight * value) / sum(weight of the *applicable* signals)
// A signal is applicable when the query supplies the information it needs AND at least one candidate has a positive
// value for it. Inapplicable signals are left out of the denominator for everyone (so they do not shift the ranking).
// A candidate with no data for an applicable signal contributes 0 for it: missing data never earns credit.

export type QueryContext = {
  defectId: string;
  /** Free-text inspector notes; only used by the pipelines that read metadata. */
  metadata: string;
  /** Per-cause semantic values (already floored/rescaled to 0..1), supplied by the semantic stage. */
  semantic?: Map<string, { cause: number | null; case: number | null; bestCase?: string }>;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 10000) / 10000;

export type Scored = { cause: EvidenceCause; score: number; signals: SignalResult[]; matchedAny: boolean };

type Raw = { value: number | null; detail: string };

export function scoreCandidates(causes: EvidenceCause[], ctx: QueryContext, cfg: PipelineConfig, useMetadata: boolean): { scored: Scored[]; notes: string[] } {
  const notes: string[] = [];
  const names = (Object.keys(cfg.weights) as SignalName[]).filter((n) => (cfg.weights[n] ?? 0) > 0);

  // Query-side vocabulary built only from what the graph contains (nothing hard-coded).
  const metaTokens = useMetadata ? tokenize(ctx.metadata) : [];
  const metaSet = new Set(metaTokens);
  const symptomDocs = causes.flatMap((c) => [...c.symptoms.map((s) => s.text), ...c.cases.flatMap((k) => k.symptom_texts)]).map(tokenize);
  const symptomIdf: Idf = buildIdf([...symptomDocs, metaTokens]);
  const components = [...new Set(causes.flatMap((c) => [...c.component_texts, ...c.cases.flatMap((k) => k.component_texts)]))];
  const componentIdf: Idf = buildIdf(components.map(tokenize));

  const raw = new Map<string, Record<string, Raw>>();
  for (const c of causes) {
    const r: Record<string, Raw> = {};
    if (names.includes("defect")) r.defect = defectSignal(c, ctx.defectId);
    if (names.includes("support")) r.support = supportSignal(c);
    if (names.includes("component")) r.component = componentSignal(c, metaSet, componentIdf);
    if (names.includes("symptom")) r.symptom = symptomSignal(c, metaTokens, symptomIdf);
    if (names.includes("semantic")) r.semantic = semanticSignal(c, ctx);
    raw.set(c.cause_id, r);
  }

  const queryHasInfo: Record<SignalName, boolean> = {
    defect: true, support: true, semantic: true,
    component: metaSet.size > 0 && components.length > 0,
    symptom: metaTokens.length > 0 && symptomDocs.some((d) => d.length > 0),
  };
  const applicable = new Set(names.filter((n) => n === "defect" || (queryHasInfo[n] && causes.some((c) => (raw.get(c.cause_id)![n]?.value ?? 0) > 0))));
  for (const n of names) {
    if (!applicable.has(n)) notes.push(`Signal "${n}" not applicable: ${queryHasInfo[n] ? "no candidate has matching data" : "the query supplies no usable information for it"}.`);
  }
  const totalWeight = [...applicable].reduce((s, n) => s + (cfg.weights[n] ?? 0), 0);

  const scored = causes.map((cause): Scored => {
    const r = raw.get(cause.cause_id)!;
    const signals: SignalResult[] = names.map((n) => {
      const weight = cfg.weights[n] ?? 0;
      if (!applicable.has(n)) return { name: n, weight, value: null, status: "not_applicable", detail: r[n].detail };
      return r[n].value == null
        ? { name: n, weight, value: null, status: "missing", detail: r[n].detail }
        : { name: n, weight, value: round(r[n].value), status: "scored", detail: r[n].detail };
    });
    const sum = signals.reduce((s, x) => s + (x.status === "scored" ? x.weight * (x.value ?? 0) : 0), 0);
    return {
      cause, signals,
      score: totalWeight ? round(sum / totalWeight) : 0,
      matchedAny: signals.some((x) => x.status === "scored" && (x.value ?? 0) > 0),
    };
  });
  return { scored, notes };
}

function defectSignal(c: EvidenceCause, defectId: string): Raw {
  if (c.defect_ids.length) {
    const hit = c.defect_ids.includes(defectId);
    return { value: hit ? 1 : 0, detail: hit ? `MAY_CAUSE → ${defectId}` : `linked to ${c.defect_ids.join(", ")} only, not ${defectId}` };
  }
  if (c.origin === "legacy") {
    return c.defect_text_match
      ? { value: RETRIEVAL_CONFIG.legacyTextDefectCredit, detail: "defect mentioned in cause/case text; legacy schema has no Defect link" }
      : { value: 0, detail: "defect not mentioned in cause/case text; legacy schema has no Defect link" };
  }
  return { value: 0, detail: "no MAY_CAUSE link to any defect" };
}

function supportSignal(c: EvidenceCause): Raw {
  if (!c.cases.length && !c.sources.length) return { value: null, detail: "no supporting cases or sources in the graph" };
  // A case explicitly linked to a different defect does not support this one.
  const cases = c.cases.reduce((s, k) => s + (k.defect_match === false ? 0 : k.strength), 0);
  const n = cases + RETRIEVAL_CONFIG.support.sourceWeight * c.sources.length;
  return { value: n / (n + RETRIEVAL_CONFIG.support.halfSaturation), detail: `${c.cases.length} case(s), ${c.sources.length} source(s); effective support ${n.toFixed(1)}` };
}

function componentSignal(c: EvidenceCause, metaSet: Set<string>, idf: Idf): Raw {
  const own = [...c.component_texts.map((t) => ({ t, w: 1 })), ...c.cases.flatMap((k) => k.component_texts.map((t) => ({ t, w: 1 })))];
  if (!own.length) return { value: null, detail: "no component recorded on the cause or its cases" };
  let best = { v: 0, t: "" };
  for (const { t } of own) {
    const cov = coverage(tokenize(t), metaSet, idf);
    if (cov >= RETRIEVAL_CONFIG.component.minCoverage && cov > best.v) best = { v: cov, t };
  }
  return best.v > 0 ? { value: best.v, detail: `component "${best.t}" matches the notes` } : { value: 0, detail: "recorded components do not match the notes" };
}

function symptomSignal(c: EvidenceCause, metaTokens: string[], idf: Idf): Raw {
  const texts = [...c.symptoms.map((s) => ({ t: s.text, w: 1 })), ...c.cases.flatMap((k) => k.symptom_texts.map((t) => ({ t, w: k.strength })))];
  if (!texts.length) return { value: null, detail: "no symptoms recorded on the cause or its cases" };
  let best = { v: 0, t: "" };
  for (const { t, w } of texts) {
    const v = cosine(metaTokens, tokenize(t), idf) * w;
    if (v > best.v) best = { v, t };
  }
  return best.v > 0 ? { value: clamp(best.v), detail: `closest symptom: "${best.t.slice(0, 100)}"` } : { value: 0, detail: "no symptom text overlaps the notes" };
}

function semanticSignal(c: EvidenceCause, ctx: QueryContext): Raw {
  const s = ctx.semantic?.get(c.cause_id);
  if (!s || (s.cause == null && s.case == null)) return { value: null, detail: "no text to compare" };
  const { causeShare, caseShare } = RETRIEVAL_CONFIG.semantic;
  const value = causeShare * (s.cause ?? 0) + caseShare * (s.case ?? 0);
  return { value, detail: `cause text ${(s.cause ?? 0).toFixed(2)}${s.case == null ? ", no case text" : `, best case ${s.bestCase} ${s.case.toFixed(2)}`}` };
}
