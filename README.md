# CrackScope

Next.js app: upload an image → NVIDIA vision model returns only a defect from a hardcoded set (or "No defect") → Neo4j Aura knowledge graph returns the possible causes of that defect (`(:Cause)-[:MAY_CAUSE]->(:Defect)`) → NVIDIA writes a text explanation of what could have happened from the image, defect and possible causes.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in credentials
npm run dev                  # http://localhost:3000
```

`GET /api/health` reports whether the NVIDIA and Neo4j variables are set.

## Where things live

- `lib/defects.ts` – the hardcoded defect set.
- `lib/neo4j.ts` – the KG query (`CAUSE_QUERY`). Edit this as the graph evolves.
- `lib/nvidia.ts` – the NVIDIA chat call.
- `app/api/analyze/route.ts` – the pipeline (4 stages).

## Debugging

Every response (success or failure) includes a `trace`: each stage's status, duration and inputs/outputs (classifier result, KG query/parameters/causes). The UI shows it under "Pipeline trace". The server logs one JSON line per stage with the same `request_id`; images and keys are never logged.

- Image or request problem → `validate_image` failed.
- Wrong/invalid label → `classify_defect` (error shows the model's out-of-set value).
- No causes found → check `knowledge_graph` query/parameters/causes. The defect label is matched to `Defect.defect_id` ignoring case and `_`, `-` and `/`; Leakage/Dampness and Hollowing/Debonding share one KG node each (mapping in `lib/defects.ts`); adjust `CAUSE_QUERY` if your ids differ. A KG failure does not stop the pipeline; the explanation says no causes were available.
- Timeouts return HTTP 504 with the failed stage.

Potential causes are unverified. Not a structural safety assessment.
