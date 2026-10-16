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

// The knowledge graph is under development: this query and the shape of the
// returned paths are the only things that should need to change.
export const CAUSE_PATH_QUERY = `
MATCH path = (ct:Crack_Type)-[:What_Cause]->(p:Potential_cause)
WHERE toLower(ct.crack_type) = toLower($defect)
RETURN ct.crack_type + ' -[What_Cause]-> ' + p.potential_causes_unverified AS path
LIMIT 25`;

/** Returns the KG paths (as readable strings) that start from the given defect. */
export async function findCausePaths(defect: string): Promise<string[]> {
  const session = getDriver().session({
    database: process.env.NEO4J_DATABASE || "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const result = await session.run(CAUSE_PATH_QUERY, { defect }, { timeout: 10000 });
    return result.records.map((r) => String(r.get("path")));
  } finally {
    await session.close();
  }
}
