import { NextRequest, NextResponse } from "next/server";
import { addRelationship, deleteNode, deleteRelationship, getNode, listNodes, saveNode } from "@/lib/graph";
import { LABELS, REL_TYPES, type Label, type NodeRef, type Props, type RelType } from "@/lib/graph-schema";

export const runtime = "nodejs";

class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const isLabel = (v: unknown): v is Label => typeof v === "string" && (LABELS as string[]).includes(v);
const isRelType = (v: unknown): v is RelType => typeof v === "string" && (REL_TYPES as readonly string[]).includes(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200;

function label(v: unknown): Label {
  if (!isLabel(v)) throw new HttpError(`label must be one of: ${LABELS.join(", ")}`, 400);
  return v;
}
function relType(v: unknown): RelType {
  if (!isRelType(v)) throw new HttpError(`type must be one of: ${REL_TYPES.join(", ")}`, 400);
  return v;
}
function ref(v: unknown): NodeRef {
  const r = (v ?? {}) as { label?: unknown; id?: unknown };
  if (!isId(r.id)) throw new HttpError("Node id is required.", 400);
  return { label: label(r.label), id: r.id };
}
function props(v: unknown): Props {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new HttpError("properties must be an object.", 400);
  const scalar = (x: unknown) => ["string", "number", "boolean"].includes(typeof x);
  for (const [k, x] of Object.entries(v)) {
    if (!scalar(x) && !(Array.isArray(x) && x.every(scalar))) {
      throw new HttpError(`Property "${k}" must be a string, number, boolean or an array of those.`, 400);
    }
  }
  return v as Props;
}

function fail(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Unexpected error.";
  console.error(JSON.stringify({ event: "graph_request_failed", status, error: message }));
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const l = label(params.get("label"));
    const id = params.get("id");
    if (!id) return NextResponse.json({ nodes: await listNodes(l) });
    const found = await getNode(l, id);
    if (!found) throw new HttpError(`${l} "${id}" not found.`, 404);
    return NextResponse.json(found);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { throw new HttpError("Request body was not valid JSON.", 400); }

    let result: Record<string, unknown> = {};
    switch (body.action) {
      case "save": { // create when `id` is omitted, otherwise replace the node's properties
        const l = label(body.label);
        const id = body.id === undefined ? undefined : isId(body.id) ? body.id : (() => { throw new HttpError("Invalid id.", 400); })();
        result = { id: await saveNode(l, id, props(body.properties)) };
        break;
      }
      case "delete": {
        const n = ref(body);
        await deleteNode(n.label, n.id);
        break;
      }
      case "add_relationship":
        await addRelationship(ref(body.from), relType(body.type), ref(body.to));
        break;
      case "delete_relationship":
        await deleteRelationship(ref(body.from), relType(body.type), ref(body.to));
        break;
      default:
        throw new HttpError("Unknown action.", 400);
    }
    console.info(JSON.stringify({ event: "graph_write", action: body.action }));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return fail(e);
  }
}
