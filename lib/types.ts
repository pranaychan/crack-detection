export type ExtractedDefect = {
  crack_type: string | null;
  component: string | null;
  visual_observation: string;
  confidence_note: string;
};

export type MatchingCase = {
  case_id: string;
  building_type: string | null;
  observed_symptoms: string | null;
  evidence_status: string | null;
  evidence_notes: string | null;
  crack_type: string | null;
  component: string | null;
  potential_causes: string[];
};

export type AnalysisResponse = {
  extracted: ExtractedDefect;
  graph_connected: boolean;
  matched_cases: MatchingCase[];
  potential_causes: string[];
  message?: string;
  limitations: string[];
};
