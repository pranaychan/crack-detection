import neo4j, { type Session } from "neo4j-driver";
import { openSession } from "@/lib/neo4j";
import { RETRIEVAL_CONFIG } from "./config";
import { tokenize } from "./text";
import type { EvidenceCase, EvidenceCause } from "./types";

// Reads candidate causes and their evidence from Neo4j. Two schemas are understood and nothing is assumed:
//  * graph:  (:Cause)-[:MAY_CAUSE]->(:Defect), (:Case)-[:HAS_DEFECT|HAS_SYMPTOM]-..., sources via DERIVED_FROM / HAS_REFERENCE
//            (labels and relationship types come from lib/graph-schema.ts; relationship direction is not assumed).
//  * legacy: (:Defect_Case)-[:What_Crack]->(:Crack_Type)-[:What_Cause]->(:Potential_cause), (:Defect_Case)-[:What_Component]->(:Component)
//            (the schema written by scripts/import-cases.cypher). Only used if those labels exist in the database.
// Read-only: no query here writes to the database.

type Row = Record<string, unknown>;
const OPTS = { timeout: 10000 };

function plain(v: unknown): unknown {
  if (neo4j.isInt(v)) return v.inSafeRange() ? v.toNumber() : v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function rows(session: Session, query: string, params: Row = {}): Promise<Row[]> {
  const result = await session.run(query, params, OPTS);
  return result.records.map((r) => plain(r.toObject()) as Row);
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(strings) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/** All text-valued properties except ids; used as the searchable text of a node. */
export function textOf(props: Record<string, unknown>): string {
  return Object.entries(props).filter(([k]) => !/(^|_)id$/i.test(k)).flatMap(([, v]) => strings(v)).join(". ").slice(0, 1500);
}
const valuesFor = (props: Record<string, unknown>, key: RegExp) =>
  Object.entries(props).filter(([k]) => key.test(k)).flatMap(([, v]) => strings(v));

export const QUERIES = {
  causesInDefect: `MATCH (c:Cause)-[:MAY_CAUSE]->(:Defect {defect_id: $defectId})
OPTIONAL MATCH (c)-[:MAY_CAUSE]->(d:Defect)
WITH c, collect(DISTINCT d.defect_id) AS defect_ids WHERE c.cause_id IS NOT NULL
RETURN c.cause_id AS cause_id, properties(c) AS props, defect_ids ORDER BY cause_id LIMIT $limit`,
  causesAll: `MATCH (c:Cause) WHERE c.cause_id IS NOT NULL
OPTIONAL MATCH (c)-[:MAY_CAUSE]->(d:Defect)
RETURN c.cause_id AS cause_id, properties(c) AS props, collect(DISTINCT d.defect_id) AS defect_ids ORDER BY cause_id LIMIT $limit`,
  symptoms: `MATCH (c:Cause) WHERE c.cause_id IN $ids
MATCH (c)-[r:HAS_POSSIBLE_SYMPTOM|SUGGESTS|HAS_SYMPTOM]-(s:Symptom) WHERE s.symptom_id IS NOT NULL
RETURN c.cause_id AS cause_id, type(r) AS via, s.symptom_id AS id, properties(s) AS props`,
  directCases: `MATCH (c:Cause) WHERE c.cause_id IN $ids
MATCH (k:Case)-[r]-(c) WHERE k.case_id IS NOT NULL
RETURN DISTINCT c.cause_id AS cause_id, type(r) AS via, k.case_id AS case_id, properties(k) AS props`,
  symptomCases: `MATCH (c:Cause) WHERE c.cause_id IN $ids
MATCH (c)-[:HAS_POSSIBLE_SYMPTOM|SUGGESTS]-(s:Symptom)-[:HAS_SYMPTOM]-(k:Case) WHERE k.case_id IS NOT NULL
RETURN DISTINCT c.cause_id AS cause_id, s.symptom_id AS symptom_id, k.case_id AS case_id, properties(k) AS props`,
  caseDetails: `MATCH (k:Case) WHERE k.case_id IN $caseIds
OPTIONAL MATCH (k)-[:HAS_DEFECT]-(d:Defect)
OPTIONAL MATCH (k)-[:HAS_SYMPTOM]-(s:Symptom)
RETURN k.case_id AS case_id, collect(DISTINCT d.defect_id) AS defect_ids, collect(DISTINCT properties(s)) AS symptoms`,
  sources: `MATCH (c:Cause) WHERE c.cause_id IN $ids
MATCH (c)-[r:DERIVED_FROM|HAS_REFERENCE]-(x) WHERE any(l IN labels(x) WHERE l IN ['Source','Standard','Clause'])
RETURN DISTINCT c.cause_id AS cause_id, type(r) AS via, labels(x)[0] AS label,
  coalesce(x.source_id, x.standard_id, x.clause_id) AS id`,
  defectsInGraph: "MATCH (d:Defect) RETURN properties(d) AS properties LIMIT 50",
  labels: "CALL db.labels() YIELD label RETURN collect(label) AS labels",
  legacy: `MATCH (ct:Crack_Type)-[:What_Cause]->(p:Potential_cause) WHERE p.potential_causes_unverified IS NOT NULL
OPTIONAL MATCH (k:Defect_Case)-[:What_Crack]->(ct)
OPTIONAL MATCH (k)-[:What_Component]->(co:Component)
RETURN p.potential_causes_unverified AS cause, collect(DISTINCT ct.crack_type) AS crack_types,
  collect(DISTINCT CASE WHEN k IS NULL THEN null ELSE {case_id: k.case_id, props: properties(k), component: co.component, crack_type: ct.crack_type} END) AS cases
LIMIT $limit`,
};

export type LoadedEvidence = {
  causes: EvidenceCause[];
  queries: Record<string, string>;
  warnings: string[];
  defectsInGraph?: Record<string, unknown>[];
};

export async function loadEvidence(opts: { defectId: string; defectLabel: string; scope: "defect" | "all"; includeLegacy: boolean }): Promise<LoadedEvidence> {
  const session = openSession("READ");
  const queries: Record<string, string> = {};
  const warnings: string[] = [];
  const q = (name: keyof typeof QUERIES) => { queries[name] = QUERIES[name].replace(/\s+/g, " "); return QUERIES[name]; };
  try {
    const limit = neo4j.int(RETRIEVAL_CONFIG.limits.candidateCauses);
    const causeRows = await rows(session, q(opts.scope === "defect" ? "causesInDefect" : "causesAll"), { defectId: opts.defectId, limit });
    const byId = new Map<string, EvidenceCause>();
    for (const r of causeRows) {
      const id = String(r.cause_id);
      if (byId.has(id)) continue;
      const props = (r.props ?? {}) as Record<string, unknown>;
      byId.set(id, {
        cause_id: id, origin: "graph", properties: props, text: textOf(props), defect_ids: strings(r.defect_ids),
        defect_text_match: false, component_texts: valuesFor(props, /component/i), symptoms: [], cases: [], sources: [],
      });
    }
    if (causeRows.length >= RETRIEVAL_CONFIG.limits.candidateCauses) warnings.push(`Candidate causes capped at ${RETRIEVAL_CONFIG.limits.candidateCauses}.`);
    const ids = [...byId.keys()];

    let defectsInGraph: Record<string, unknown>[] | undefined;
    if (!ids.length) {
      defectsInGraph = (await rows(session, q("defectsInGraph"))).map((r) => r.properties as Record<string, unknown>);
    } else {
      for (const r of await rows(session, q("symptoms"), { ids })) {
        const c = byId.get(String(r.cause_id));
        const props = (r.props ?? {}) as Record<string, unknown>;
        if (c && !c.symptoms.some((s) => s.id === String(r.id))) c.symptoms.push({ id: String(r.id), via: String(r.via), text: textOf(props) });
      }

      // Cases: direct links (strength 1) and cases that share a symptom with the cause (strength 0.5).
      const caseProps = new Map<string, Record<string, unknown>>();
      const links: { causeId: string; caseId: string; via: string; strength: number }[] = [];
      for (const r of await rows(session, q("directCases"), { ids })) {
        caseProps.set(String(r.case_id), (r.props ?? {}) as Record<string, unknown>);
        links.push({ causeId: String(r.cause_id), caseId: String(r.case_id), via: String(r.via), strength: 1 });
      }
      for (const r of await rows(session, q("symptomCases"), { ids })) {
        caseProps.set(String(r.case_id), (r.props ?? {}) as Record<string, unknown>);
        links.push({ causeId: String(r.cause_id), caseId: String(r.case_id), via: `shared symptom ${r.symptom_id}`, strength: 0.5 });
      }
      const details = new Map<string, { defects: string[]; symptoms: string[] }>();
      if (caseProps.size) {
        for (const r of await rows(session, q("caseDetails"), { caseIds: [...caseProps.keys()] })) {
          details.set(String(r.case_id), {
            defects: strings(r.defect_ids),
            symptoms: ((r.symptoms as Record<string, unknown>[]) ?? []).map((s) => textOf(s ?? {})).filter(Boolean),
          });
        }
      }
      for (const l of links) {
        const c = byId.get(l.causeId);
        if (!c) continue;
        const existing = c.cases.find((x) => x.case_id === l.caseId);
        if (existing) { if (l.strength > existing.strength) { existing.strength = l.strength; existing.via = l.via; } continue; }
        const props = caseProps.get(l.caseId) ?? {};
        const d = details.get(l.caseId);
        c.cases.push({
          case_id: l.caseId, origin: "graph", via: l.via, strength: l.strength, text: textOf(props),
          component_texts: valuesFor(props, /component/i),
          symptom_texts: [...valuesFor(props, /symptom/i), ...(d?.symptoms ?? [])],
          defect_match: d?.defects.length ? d.defects.includes(opts.defectId) : null,
        });
      }
      for (const r of await rows(session, q("sources"), { ids })) {
        const c = byId.get(String(r.cause_id));
        const sid = String(r.id);
        if (c && r.id != null && !c.sources.some((s) => s.id === sid && s.via === r.via)) c.sources.push({ id: sid, label: String(r.label), via: String(r.via) });
      }
    }

    const causes = [...byId.values()];
    if (opts.includeLegacy) {
      try {
        const labels = strings((await rows(session, q("labels")))[0]?.labels);
        if (["Defect_Case", "Crack_Type", "Potential_cause"].every((l) => labels.includes(l))) {
          causes.push(...(await loadLegacy(session, opts.defectLabel, limit, q("legacy"), byId)));
        }
      } catch (e) {
        warnings.push(`Legacy case schema could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { causes, queries, warnings, defectsInGraph };
  } finally {
    await session.close();
  }
}

async function loadLegacy(session: Session, defectLabel: string, limit: unknown, query: string, existing: Map<string, EvidenceCause>): Promise<EvidenceCause[]> {
  const defectTokens = new Set(tokenize(defectLabel));
  const mentions = (text: string) => tokenize(text).some((t) => defectTokens.has(t));
  const out: EvidenceCause[] = [];
  for (const r of await rows(session, query, { limit })) {
    const id = String(r.cause);
    if (existing.has(id)) continue; // never shadow a graph-schema cause with the same id
    const cases: EvidenceCase[] = [];
    for (const c of (r.cases as Row[]) ?? []) {
      if (!c || c.case_id == null || cases.some((x) => x.case_id === String(c.case_id))) continue;
      const props = (c.props ?? {}) as Record<string, unknown>;
      cases.push({
        case_id: String(c.case_id), origin: "legacy", via: "What_Crack→What_Cause", strength: 1,
        text: [c.crack_type, textOf(props)].filter(Boolean).join(". ").slice(0, 1500),
        component_texts: strings(c.component), symptom_texts: strings(props.observed_symptoms),
        defect_match: null, // the legacy schema has no Defect link
      });
    }
    const crackTypes = strings(r.crack_types);
    const text = [id, ...crackTypes].join(". ");
    out.push({
      cause_id: id, origin: "legacy", properties: { potential_causes_unverified: id, crack_types: crackTypes }, text,
      defect_ids: [], defect_text_match: mentions(text) || cases.some((c) => mentions(c.text)),
      component_texts: [], symptoms: [], cases, sources: [],
    });
  }
  return out;
}
