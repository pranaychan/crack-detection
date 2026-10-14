import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | undefined;

function getDriver(): Driver {
  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    throw new Error("Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD.");
  }
  driver ??= neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD), {
    maxConnectionPoolSize: 5,
    connectionAcquisitionTimeout: 5000,
    connectionTimeout: 5000,
  });
  return driver;
}

export type Cause = { cause_id: string; properties: Record<string, unknown> };

// Schema: (:Cause)-[:MAY_CAUSE]->(:Defect). The defect label from the vision model
// is matched to Defect.defect_id ignoring case and "_", "-", "/" (e.g. "Rebar Corrosion" ~ "rebar_corrosion").
// The caller passes the KG name (see toKgDefect), e.g. "Leakage/Dampness".
// The KG is under development: this query is the only thing that should need to change.
export const CAUSE_QUERY = `
MATCH (c:Cause)-[:MAY_CAUSE]->(d:Defect)
WHERE replace(replace(replace(toLower(d.defect_id), '_', ' '), '-', ' '), '/', ' ')
    = replace(replace(replace(toLower($defect), '_', ' '), '-', ' '), '/', ' ')
RETURN c.cause_id AS cause_id, properties(c) AS properties
LIMIT 25`;

/** Returns the possible causes linked to the given defect. */
export async function findCauses(defect: string): Promise<Cause[]> {
  const session = getDriver().session({
    database: process.env.NEO4J_DATABASE || "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const result = await session.run(CAUSE_QUERY, { defect }, { timeout: 10000 });
    return result.records.map((r) => ({
      cause_id: String(r.get("cause_id")),
      properties: r.get("properties") as Record<string, unknown>,
    }));
  } finally {
    await session.close();
  }
}
