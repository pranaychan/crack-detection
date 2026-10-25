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

// Candidate-cause retrieval and ranking live in lib/retrieval (one strategy per pipeline).
