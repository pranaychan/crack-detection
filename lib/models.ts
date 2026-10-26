// The four prediction models shown in the top navbar. Only model-1 is implemented; the others are static placeholders.
// Rename a placeholder by editing its `label`.
export const MODELS = [
  { id: "model-1", label: "Graph-Based", href: "/", graphHref: "/graph", live: true },
  { id: "model-2", label: "Model 2", href: "/model-2", graphHref: "/model-2/graph", live: false },
  { id: "model-3", label: "Model 3", href: "/model-3", graphHref: "/model-3/graph", live: false },
  { id: "model-4", label: "Model 4", href: "/model-4", graphHref: "/model-4/graph", live: false },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const PLACEHOLDER_IDS = MODELS.filter((m) => !m.live).map((m) => m.id);
export const findModel = (id: string) => MODELS.find((m) => m.id === id);
