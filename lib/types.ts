import type { PipelineId } from "@/lib/pipelines";
import type { RankedCause } from "@/lib/retrieval/types";

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
  /** Pipeline that produced `causes` (defaults to "graph" when the request does not name one). */
  pipeline: PipelineId;
  /** The causes given to the model, best first, each with its score and evidence (empty if none / KG unavailable). */
  causes: RankedCause[];
  explanation: string;
  trace: TraceStep[];
};

export type AnalysisError = {
  request_id: string;
  error: string;
  failed_stage: TraceStep["stage"];
  trace: TraceStep[];
};
