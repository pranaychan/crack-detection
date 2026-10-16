# CrackScope

Next.js app: upload an image → NVIDIA vision model picks a defect from a hardcoded set (or "No defect") → Neo4j Aura knowledge graph returns paths from that defect to suspected causes → NVIDIA writes a text explanation from the defect, image and KG paths.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in credentials
npm run dev                  # http://localhost:3000
```

`GET /api/health` reports whether the NVIDIA and Neo4j variables are set.

## Where things live

- `lib/defects.ts` – the hardcoded defect set.
- `lib/neo4j.ts` – the KG query (`CAUSE_PATH_QUERY`). Edit this as the graph evolves.
- `lib/nvidia.ts` – the NVIDIA chat call.
- `app/api/analyze/route.ts` – the pipeline (4 stages).

## Debugging

Every response (success or failure) includes a `trace`: each stage's status, duration and inputs/outputs (classifier result, KG query/parameters/paths). The UI shows it under "Pipeline trace". The server logs one JSON line per stage with the same `request_id`; images and keys are never logged.

- Image or request problem → `validate_image` failed.
- Wrong/invalid label → `classify_defect` (error shows the model's out-of-set value).
- No causes found → check `knowledge_graph` query/parameters/paths. A KG failure does not stop the pipeline; the explanation says no graph paths were available.
- Timeouts return HTTP 504 with the failed stage.

Potential causes are unverified. Not a structural safety assessment.

## Updating the AuraDB knowledge graph with Python

The Python utility in `scripts/manage_knowledge_graph.py` supports updating existing case properties, adding/upserting a case with its component/crack/cause links, importing a CSV, and inspecting the graph schema. It uses the current labels and relationship types from this project:

- `(:Defect_Case)-[:What_Crack]->(:Crack_Type)`
- `(:Defect_Case)-[:What_Component]->(:Component)`
- `(:Crack_Type)-[:What_Cause]->(:Potential_cause)`

Install dependencies and configure `.env.local` (or `.env`) with the same Aura credentials used by the app:

```bash
pip install -r requirements.txt
```

Example commands, run from the repository root:

```bash
# Verify connectivity and inspect node/relationship types
python scripts/manage_knowledge_graph.py inspect

# Update properties on an existing case (case_id must already exist)
python scripts/manage_knowledge_graph.py update --case-id CRK001 --screening-priority High --evidence-notes "Updated after inspection"

# Add/update a case and MERGE its component, crack type, possible cause and relationships
python scripts/manage_knowledge_graph.py add-case --json scripts/example-case.json

# Import/upsert all rows from the existing CSV
python scripts/manage_knowledge_graph.py import-csv --file data/synthetic_crack_defect_cases.csv
```

CSV imports use `MERGE`, so rerunning the command does not intentionally duplicate cases/nodes/relationships. Blank CSV cells do not erase existing case properties. Existing relationships are retained; this tool adds missing links but does not automatically delete links that are no longer present in a CSV. Review the JSON output and keep a backup before bulk changes. Potential causes remain unverified and should not be treated as confirmed engineering conclusions.
