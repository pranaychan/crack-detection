import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // read env at request time, not build time

export async function GET() {
  return NextResponse.json({
    app: "ok",
    nvidia_configured: Boolean(process.env.NVIDIA_API_KEY),
    supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    neo4j_configured: Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD),
  });
}
