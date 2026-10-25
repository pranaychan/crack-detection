import type { PipelineId } from "@/lib/pipelines";
import type { SignalName } from "./types";

export type PipelineConfig = {
  /** Signal weights. Signals that are not applicable to a query are left out of the normalisation. */
  weights: Partial<Record<SignalName, number>>;
  /** Minimum score (0..1, share of the applicable weight) for a candidate to be returned. */
  minScore: number;
};

export const RETRIEVAL_CONFIG = {
  pipelines: {
    graph: { weights: { defect: 0.5, support: 0.5 }, minScore: 0.2 },
    contextual: { weights: { defect: 0.3, component: 0.2, symptom: 0.3, support: 0.2 }, minScore: 0.35 },
    semantic: { weights: { semantic: 1 }, minScore: 0.05 },
    hybrid: { weights: { defect: 0.2, component: 0.15, symptom: 0.2, support: 0.15, semantic: 0.3 }, minScore: 0.25 },
  } satisfies Record<PipelineId, PipelineConfig>,
  /** support = n / (n + halfSaturation), n = effective supporting cases + sourceWeight * sources. */
  support: { halfSaturation: 2, sourceWeight: 0.5 },
  /** A candidate component counts only if this share of its (idf-weighted) tokens appears in the metadata. */
  component: { minCoverage: 0.5 },
  /** Legacy schema only: credit for a defect mentioned in text but not linked in the graph. */
  legacyTextDefectCredit: 0.5,
  semantic: {
    causeShare: 0.5,
    caseShare: 0.5,
    /** Similarity at or below the floor scores 0 (embedding cosines are compressed, so their floor is higher). */
    floor: { embedding: 0.2, lexical_tfidf: 0.05 },
    maxTexts: 200,
  },
  limits: { candidateCauses: 500, supportingCasesShown: 5, symptomsShown: 5, sourcesShown: 5 },
};

/**
 * Optional override via env RETRIEVAL_CONFIG, e.g.
 * {"hybrid":{"weights":{"semantic":0.5},"minScore":0.3}}. Invalid JSON or values are ignored.
 */
export function pipelineConfig(id: PipelineId): PipelineConfig {
  const base = RETRIEVAL_CONFIG.pipelines[id];
  try {
    const o = JSON.parse(process.env.RETRIEVAL_CONFIG || "{}")?.[id];
    const weights: PipelineConfig["weights"] = { ...base.weights };
    for (const [k, v] of Object.entries(o?.weights ?? {})) {
      if (k in base.weights && typeof v === "number" && v >= 0 && Number.isFinite(v)) weights[k as SignalName] = v;
    }
    const minScore = typeof o?.minScore === "number" && o.minScore >= 0 && o.minScore <= 1 ? o.minScore : base.minScore;
    return { weights, minScore };
  } catch {
    return base;
  }
}
