import neo4j, { Driver } from "neo4j-driver";
import type { MatchingCase } from "@/lib/types";

let driver: Driver | undefined;

export function isNeo4jConfigured(): boolean {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD);
}

function getDriver(): Driver {
  if (!isNeo4jConfigured()) {
    throw new Error("Neo4j is not configured. Add NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD.");
  }
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
      { maxConnectionPoolSize: 5, connectionAcquisitionTimeout: 5000, connectionTimeout: 5000 }
    );
  }
  return driver;
}

/** Exact-match, read-only query against the user's existing Aura graph schema. */
export async function findMatchingCases(input: {
  crackType: string;
  component: string;
}): Promise<MatchingCase[]> {
  const session = getDriver().session({
    database: process.env.NEO4J_DATABASE || "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });

  try {
    const result = await session.run(
      `MATCH (d:Defect_Case)-[:What_Crack]->(ct:Crack_Type)
       MATCH (d)-[:What_Component]->(c:Component)
       MATCH (ct)-[:What_Cause]->(p:Potential_cause)
       WHERE toLower(ct.crack_type) = toLower($crack_type)
         AND toLower(c.component) = toLower($component)
       RETURN
         d.case_id AS case_id,
         d.building_type AS building_type,
         d.observed_symptoms AS observed_symptoms,
         d.evidence_status AS evidence_status,
         d.evidence_notes AS evidence_notes,
         ct.crack_type AS crack_type,
         c.component AS component,
         collect(DISTINCT p.potential_causes_unverified) AS potential_causes
       ORDER BY case_id ASC
       LIMIT 50`,
      { crack_type: input.crackType, component: input.component },
      { timeout: 10000 }
    );

    return result.records.map((record) => ({
      case_id: String(record.get("case_id") ?? "Unknown case"),
      building_type: record.get("building_type") ?? null,
      observed_symptoms: record.get("observed_symptoms") ?? null,
      evidence_status: record.get("evidence_status") ?? null,
      evidence_notes: record.get("evidence_notes") ?? null,
      crack_type: record.get("crack_type") ?? null,
      component: record.get("component") ?? null,
      potential_causes: ((record.get("potential_causes") as unknown[]) || [])
        .filter((cause): cause is string => typeof cause === "string" && cause.trim().length > 0),
    }));
  } finally {
    await session.close();
  }
}

export async function getGraphHealth(): Promise<{ connected: boolean; cases?: number; error?: string }> {
  let session: ReturnType<Driver["session"]> | undefined;
  try {
    const d = getDriver();
    session = d.session({ database: process.env.NEO4J_DATABASE || "neo4j", defaultAccessMode: neo4j.session.READ });
    const result = await session.run("MATCH (d:Defect_Case) RETURN count(d) AS cases");
    const value = result.records[0]?.get("cases");
    const cases = neo4j.isInt(value) ? value.toNumber() : Number(value ?? 0);
    return { connected: true, cases };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Unable to connect to Neo4j." };
  } finally {
    await session?.close();
  }
}
