// Shared (client + server) description of the knowledge graph. Labels and relationship
// types are whitelisted here because Cypher cannot parameterise them.
export const ID_KEYS = {
  Defect: "defect_id",
  Cause: "cause_id",
  Symptom: "symptom_id",
  Standard: "standard_id",
  Clause: "clause_id",
  Source: "source_id",
  Case: "case_id",
} as const;

export type Label = keyof typeof ID_KEYS;
export const LABELS = Object.keys(ID_KEYS) as Label[];

export const REL_TYPES = [
  "MAY_CAUSE", "HAS_POSSIBLE_SYMPTOM", "SUGGESTS", "HAS_SYMPTOM", "HAS_DEFECT",
  "HAS_CLAUSE", "HAS_REFERENCE", "DERIVED_FROM",
] as const;
export type RelType = (typeof REL_TYPES)[number];

export type Props = Record<string, string | number | boolean | (string | number | boolean)[]>;
export type GraphNode = { id: string; properties: Props };
export type Relationship = { type: RelType; direction: "out" | "in"; label: string; id: string };
export type NodeRef = { label: Label; id: string };
