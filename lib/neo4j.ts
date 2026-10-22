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

export function openSession(mode: "READ" | "WRITE" = "READ") {
  return getDriver().session({
    database: process.env.NEO4J_DATABASE || "neo4j",
    defaultAccessMode: mode === "WRITE" ? neo4j.session.WRITE : neo4j.session.READ,
  });
}

export type Cause = { cause_id: string; properties: Record<string, unknown> };

// Schema: (:Cause)-[:MAY_CAUSE]->(:Defect {defect_id: "DEF_..."}).
// The KG has no ranking property yet, so "top k" is the first k causes ordered by cause_id.
// The KG is under development: this query is the only thing that should need to change.
export const CAUSE_QUERY = `
MATCH (c:Cause)-[:MAY_CAUSE]->(d:Defect {defect_id: $defectId})
RETURN c.cause_id AS cause_id, properties(c) AS properties
ORDER BY c.cause_id
LIMIT $k`;

const DEFECTS_QUERY = "MATCH (d:Defect) RETURN properties(d) AS properties LIMIT 50";

/**
 * Returns up to k possible causes of the defect. When none are found, also returns every
 * Defect node in the graph so the trace shows which ids exist.
 */
export async function findCauses(defectId: string, k: number): Promise<{ causes: Cause[]; defectsInGraph?: Record<string, unknown>[] }> {
  const session = openSession();
  try {
    const result = await session.run(CAUSE_QUERY, { defectId, k: neo4j.int(k) }, { timeout: 10000 });
    const causes = result.records.map((r) => ({
      cause_id: String(r.get("cause_id")),
      properties: r.get("properties") as Record<string, unknown>,
    }));
    if (causes.length) return { causes };
    const all = await session.run(DEFECTS_QUERY, {}, { timeout: 10000 });
    return { causes, defectsInGraph: all.records.map((r) => r.get("properties") as Record<string, unknown>) };
  } finally {
    await session.close();
  }
}
