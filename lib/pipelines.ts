// The four retrieval pipelines (client + server safe). `href` is the page that runs each one.
export const PIPELINES = [
  { id: "graph", label: "Graph-Based", href: "/", blurb: "Causes linked to the defect in the knowledge graph, ranked by graph evidence (supporting cases, sources)." },
  { id: "contextual", label: "Contextual Ranking", href: "/contextual", blurb: "Graph candidates re-ranked by defect, component, symptom similarity and supporting evidence." },
  { id: "semantic", label: "Semantic Retrieval", href: "/semantic", blurb: "Cases and causes retrieved by text similarity (embeddings), independent of graph links to the defect." },
  { id: "hybrid", label: "Hybrid Retrieval", href: "/hybrid", blurb: "Graph retrieval, semantic similarity and contextual ranking combined in one score." },
] as const;

export type PipelineId = (typeof PIPELINES)[number]["id"];
export const isPipelineId = (v: unknown): v is PipelineId => PIPELINES.some((p) => p.id === v);
