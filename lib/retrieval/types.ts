import type { PipelineId } from "@/lib/pipelines";

export type SignalName = "defect" | "component" | "symptom" | "support" | "semantic";

/** A supporting historical case, normalised from either graph schema. */
export type EvidenceCase = {
  case_id: string;
  origin: "graph" | "legacy";
  /** Relationship (or path) through which the case supports the cause. */
  via: string;
  /** 1 = direct link, 0.5 = indirect (e.g. shares a symptom). */
  strength: number;
  text: string;
  component_texts: string[];
  symptom_texts: string[];
  /** true / false when the case is linked to defects in the graph; null when it has no defect link. */
  defect_match: boolean | null;
};

export type EvidenceCause = {
  cause_id: string;
  origin: "graph" | "legacy";
  properties: Record<string, unknown>;
  text: string;
  /** Defect ids the cause is linked to via MAY_CAUSE (graph schema only). */
  defect_ids: string[];
  /** Legacy schema has no Defect link: true when the cause/case text mentions the selected defect. */
  defect_text_match: boolean;
  component_texts: string[];
  symptoms: { id: string; via: string; text: string }[];
  cases: EvidenceCase[];
  sources: { id: string; label: string; via: string }[];
};

export type SignalResult = {
  name: SignalName;
  weight: number;
  /** 0..1 when scored; null when the candidate has no data for this signal. */
  value: number | null;
  status: "scored" | "missing" | "not_applicable";
  detail: string;
};

export type RankedCause = {
  cause_id: string;
  properties: Record<string, unknown>;
  rank: number;
  score: number;
  evidence: {
    pipeline: PipelineId;
    origin: "graph" | "legacy";
    defect_linked: boolean;
    signals: SignalResult[];
    supporting_cases: { case_id: string; via: string; strength: number; defect_match: boolean | null; summary: string }[];
    symptoms: { id: string; via: string; text: string }[];
    sources: { id: string; label: string; via: string }[];
    duplicate_ids?: string[];
  };
};

export type RetrievalInput = { defect: { id: string; label: string }; metadata: string; k: number };

export type RetrievalResult = {
  causes: RankedCause[];
  /** Diagnostics for the pipeline trace. */
  trace: Record<string, unknown>;
};
