// The defects the user can choose from. `id` is exactly the Defect.defect_id in the knowledge graph.
export const DEFECTS = [
  { id: "DEF_CRACKS", label: "Cracks" },
  { id: "DEF_LEAKAGE", label: "Leakage" },
  { id: "DEF_HOLLOWING", label: "Hollowing" },
  { id: "DEF_REBAR_CORROSION", label: "Rebar corrosion" },
  { id: "DEF_SETTLEMENT", label: "Settlement" },
  { id: "DEF_HONEYCOMBING", label: "Honeycombing" },
] as const;

export const MAX_TOP_K = 25;
export const DEFAULT_TOP_K = 5;
