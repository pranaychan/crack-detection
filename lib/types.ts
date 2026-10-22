import type { Cause } from "@/lib/neo4j";

export type TraceStep = {
  stage: "validate_input" | "store_image" | "knowledge_graph" | "explain";
  status: "ok" | "skipped" | "failed";
  ms: number;
  /** What went in / came out of this stage, or the error message. */
  detail: Record<string, unknown>;
};

export type AnalysisResponse = {
  request_id: string;
  defect: string;
  /** The top-k knowledge-graph causes that were given to the model (empty if none / KG unavailable). */
  causes: Cause[];
  explanation: string;
  trace: TraceStep[];
};

export type AnalysisError = {
  request_id: string;
  error: string;
  failed_stage: TraceStep["stage"];
  trace: TraceStep[];
};
