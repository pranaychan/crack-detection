export type TraceStep = {
  stage: "validate_image" | "classify_defect" | "knowledge_graph" | "explain";
  status: "ok" | "skipped" | "failed";
  ms: number;
  /** What went in / came out of this stage, or the error message. */
  detail: Record<string, unknown>;
};

export type AnalysisResponse = {
  request_id: string;
  defect: string;
  explanation: string;
  trace: TraceStep[];
};

export type AnalysisError = {
  request_id: string;
  error: string;
  failed_stage: TraceStep["stage"];
  trace: TraceStep[];
};
