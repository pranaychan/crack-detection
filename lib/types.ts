export type ExtractedDefect = {
  crack_type: string | null;
  component: string | null;
  building_type: string | null;
  symptoms: string;
  keywords: string[];
  uncertainty: string;
};

export type RelatedCase = {
  case_id: string;
  building_type: string | null;
  crack_type: string | null;
  component: string | null;
  symptoms: string | null;
  potential_causes: string[];
  priority: string | null;
  evidence_status: string | null;
  evidence_notes: string | null;
  follow_up: string | null;
  match_reason: string;
};

export type AnalysisResponse = {
  extracted: ExtractedDefect;
  graph_connected: boolean;
  related_cases: RelatedCase[];
  analysis: string;
  limitations: string[];
};
