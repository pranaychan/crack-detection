import { NextResponse } from "next/server";
import { isNeo4jConfigured, getGraphHealth } from "@/lib/neo4j";

export const runtime = "nodejs";

export async function GET() {
  const graph = isNeo4jConfigured()
    ? await getGraphHealth()
    : { connected: false, error: "Neo4j environment variables are missing." };
  return NextResponse.json({
    app: "ok",
    nvidia_configured: Boolean(process.env.NVIDIA_API_KEY),
    neo4j: graph,
  }, { status: graph.connected ? 200 : 503 });
}
