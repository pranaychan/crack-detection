import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | undefined;

export function isNeo4jConfigured(): boolean {
  return Boolean(
    process.env.NEO4J_URI &&
    process.env.NEO4J_USERNAME &&
    process.env.NEO4J_PASSWORD
  );
}

function getDriver(): Driver {
  if (!isNeo4jConfigured()) {
    throw new Error("Neo4j is not configured. Add NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD.");
  }
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
      { maxConnectionPoolSize: 5, connectionAcquisitionTimeout: 8000 }
    );
  }
  return driver;
}

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

// This is a fixed, read-only Cypher template. User text is only passed as parameters.
export async function findRelatedCases(input: {
  crackType?: string | null;
  component?: string | null;
  buildingType?: string | null;
  keywords?: string[];
}): Promise<RelatedCase[]> {
  const d = getDriver();
  const session = d.session({ database: process.env.NEO4J_DATABASE || "neo4j", defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      `MATCH (c:DefectCase)
       OPTIONAL MATCH (c)-[:HAS_CRACK_TYPE]->(t:CrackType)
       OPTIONAL MATCH (c)-[:OCCURS_ON]->(p:Component)
       OPTIONAL MATCH (c)-[:MAY_BE_ASSOCIATED_WITH]->(cause:PotentialCause)
       WITH c, t, p, collect(DISTINCT cause.name) AS causes,
         CASE WHEN $crackType IS NOT NULL AND toLower(coalesce(t.name, '')) CONTAINS toLower($crackType) THEN 3 ELSE 0 END +
         CASE WHEN $component IS NOT NULL AND toLower(coalesce(p.name, '')) CONTAINS toLower($component) THEN 3 ELSE 0 END +
         CASE WHEN $buildingType IS NOT NULL AND toLower(coalesce(c.building_type, '')) CONTAINS toLower($buildingType) THEN 1 ELSE 0 END +
         reduce(score = 0, keyword IN $keywords |
           score + CASE WHEN toLower(coalesce(c.observed_symptoms, '')) CONTAINS toLower(keyword)
                         OR toLower(coalesce(c.evidence_notes, '')) CONTAINS toLower(keyword)
                        THEN 1 ELSE 0 END) AS score
       WHERE score > 0
       RETURN c.case_id AS case_id,
         c.building_type AS building_type,
         t.name AS crack_type,
         p.name AS component,
         c.observed_symptoms AS symptoms,
         causes AS potential_causes,
         c.screening_priority AS priority,
         c.evidence_status AS evidence_status,
         c.evidence_notes AS evidence_notes,
         c.suggested_follow_up AS follow_up,
         score AS score
       ORDER BY score DESC, case_id ASC
       LIMIT 8`,
      {
        crackType: input.crackType || null,
        component: input.component || null,
        buildingType: input.buildingType || null,
        keywords: (input.keywords || []).slice(0, 8),
      }
    );
    return result.records.map((r) => {
      const score = Number(r.get("score") || 0);
      return {
        case_id: r.get("case_id"),
        building_type: r.get("building_type"),
        crack_type: r.get("crack_type"),
        component: r.get("component"),
        symptoms: r.get("symptoms"),
        potential_causes: (r.get("potential_causes") || []).filter(Boolean),
        priority: r.get("priority"),
        evidence_status: r.get("evidence_status"),
        evidence_notes: r.get("evidence_notes"),
        follow_up: r.get("follow_up"),
        match_reason: `Graph match score: ${score}`,
      };
    });
  } finally {
    await session.close();
  }
}

export async function getGraphHealth(): Promise<{ connected: boolean; cases?: number; error?: string }> {
  let session: ReturnType<Driver["session"]> | undefined;
  try {
    const d = getDriver();
    session = d.session({ database: process.env.NEO4J_DATABASE || "neo4j", defaultAccessMode: neo4j.session.READ });
    const result = await session.run("MATCH (c:DefectCase) RETURN count(c) AS cases");
    const value = result.records[0]?.get("cases");
    const cases = neo4j.isInt(value) ? value.toNumber() : Number(value ?? 0);
    return { connected: true, cases };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Unable to connect to Neo4j." };
  } finally {
    await session?.close();
  }
}
