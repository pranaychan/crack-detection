// Hardcoded defect set the vision model must choose from.
export const NO_DEFECT = "No defect";

export const DEFECTS = [
  "Crack", "Leakage", "Dampness", "Hollowing", "Debonding", "Rebar Corrosion", "Settlement", "Honeycombing",
];

// The knowledge graph merges some defects into one node. Maps a detected defect to its KG name.
const KG_NAMES: Record<string, string> = {
  Leakage: "Leakage/Dampness",
  Dampness: "Leakage/Dampness",
  Hollowing: "Hollowing/Debonding",
  Debonding: "Hollowing/Debonding",
};

export const toKgDefect = (defect: string): string => KG_NAMES[defect] ?? defect;
