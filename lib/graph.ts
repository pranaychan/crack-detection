import neo4j from "neo4j-driver";
import { openSession } from "@/lib/neo4j";
import { ID_KEYS, type GraphNode, type Label, type NodeRef, type Props, type RelType, type Relationship } from "@/lib/graph-schema";

// Every label / key / relationship type interpolated below comes from the whitelists in
// graph-schema.ts (validated in the API route); values always go through parameters.

function plain(v: unknown): unknown {
  if (neo4j.isInt(v)) return v.inSafeRange() ? v.toNumber() : v.toString();
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

const toNeo = (v: Props[string]) =>
  Array.isArray(v) ? v.map((x) => (typeof x === "number" && Number.isInteger(x) ? neo4j.int(x) : x))
  : typeof v === "number" && Number.isInteger(v) ? neo4j.int(v) : v;

function toProps(raw: Record<string, unknown>): Props {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, plain(v)])) as Props;
}

/** Runs one statement; every call opens and closes its own session. */
async function run(mode: "READ" | "WRITE", query: string, params: Record<string, unknown>) {
  const session = openSession(mode);
  try {
    return (await session.run(query, params, { timeout: 10000 })).records;
  } finally {
    await session.close();
  }
}

export async function listNodes(label: Label): Promise<GraphNode[]> {
  const key = ID_KEYS[label];
  const records = await run("READ", `MATCH (n:${label}) RETURN properties(n) AS p ORDER BY n.${key} LIMIT 300`, {});
  return records.map((r) => {
    const properties = toProps(r.get("p"));
    return { id: String(properties[key]), properties };
  });
}

export async function getNode(label: Label, id: string): Promise<{ node: GraphNode; relationships: Relationship[] } | null> {
  const key = ID_KEYS[label];
  const nodes = await run("READ", `MATCH (n:${label} {${key}: $id}) RETURN properties(n) AS p`, { id });
  if (!nodes.length) return null;

  const relationships: Relationship[] = [];
  for (const [direction, pattern] of [["out", "-[r]->"], ["in", "<-[r]-"]] as const) {
    const records = await run("READ",
      `MATCH (n:${label} {${key}: $id})${pattern}(o) RETURN type(r) AS type, labels(o)[0] AS label, properties(o) AS p LIMIT 200`, { id });
    for (const r of records) {
      const otherLabel = String(r.get("label"));
      const otherKey = ID_KEYS[otherLabel as Label];
      relationships.push({ type: r.get("type"), direction, label: otherLabel, id: String(r.get("p")?.[otherKey] ?? "?") });
    }
  }
  const properties = toProps(nodes[0].get("p"));
  return { node: { id, properties }, relationships };
}

/** Creates a node (existingId omitted) or replaces all properties of an existing one. */
export async function saveNode(label: Label, existingId: string | undefined, properties: Props): Promise<string> {
  const key = ID_KEYS[label];
  const id = existingId ?? properties[key];
  if (typeof id !== "string" || !id.trim()) throw new Error(`${key} is required.`);
  const props = Object.fromEntries(Object.entries({ ...properties, [key]: id }).map(([k, v]) => [k, toNeo(v)]));

  const query = existingId
    ? `MATCH (n:${label} {${key}: $id}) SET n = $props RETURN count(n) AS c`
    : `CREATE (n:${label}) SET n = $props RETURN 1 AS c`;
  const records = await run("WRITE", query, { id, props });
  if (!Number(records[0]?.get("c"))) throw new Error(`${label} "${id}" not found.`);
  return id;
}

export async function deleteNode(label: Label, id: string): Promise<void> {
  const key = ID_KEYS[label];
  const records = await run("WRITE", `MATCH (n:${label} {${key}: $id}) DETACH DELETE n RETURN 1 AS c`, { id });
  if (!records.length) throw new Error(`${label} "${id}" not found.`);
}

export async function addRelationship(from: NodeRef, type: RelType, to: NodeRef): Promise<void> {
  const records = await run("WRITE",
    `MATCH (a:${from.label} {${ID_KEYS[from.label]}: $aid}), (b:${to.label} {${ID_KEYS[to.label]}: $bid})
     MERGE (a)-[r:${type}]->(b) RETURN count(r) AS c`,
    { aid: from.id, bid: to.id });
  if (!Number(records[0]?.get("c"))) throw new Error("One of the two nodes was not found.");
}

export async function deleteRelationship(from: NodeRef, type: RelType, to: NodeRef): Promise<void> {
  const records = await run("WRITE",
    `MATCH (a:${from.label} {${ID_KEYS[from.label]}: $aid})-[r:${type}]->(b:${to.label} {${ID_KEYS[to.label]}: $bid})
     DELETE r RETURN 1 AS c`,
    { aid: from.id, bid: to.id });
  if (!records.length) throw new Error("Relationship not found.");
}
