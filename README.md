# CrackScope

Next.js app. The user provides an **image**, a **defect type** (dropdown) and how many causes to use (**top k**); a metadata field exists in the UI but is disabled for now.

1. The image and defect are stored in Supabase.
2. Neo4j Aura returns the top k possible causes of that defect: `(:Cause)-[:MAY_CAUSE]->(:Defect {defect_id: "DEF_…"})`.
3. NVIDIA gets the image, the defect and those causes and writes a short prediction of what could have happened.

The NVIDIA model does not identify the defect. The knowledge graph can be edited at `/graph`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in credentials
npm run dev                  # http://localhost:3000
```

`GET /api/health` reports whether the NVIDIA and Neo4j variables are set.

## Image storage (Supabase free tier)

1. Create a free project at supabase.com.
2. Run `scripts/supabase.sql` in the SQL editor. It creates a private `inspection-images` bucket and an `inspections` table (`id`, `image_path`, `defect`, `created_at`) with RLS on and no policies, so only the server key can access them.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service role / secret key, server-side only) and optionally `SUPABASE_BUCKET`.

The image and the selected defect id (e.g. `DEF_HONEYCOMBING`) are stored as soon as the input is validated, even if later stages fail. If Supabase isn't configured the step is skipped; if it fails, the trace shows the error and the analysis continues. View the collected data in the Supabase dashboard (Storage and Table editor).

## Graph editor (`/graph`)

Create, edit and delete nodes (Defect, Cause, Symptom, Standard, Clause, Source, Case) and add or remove relationships between them. Properties are free-form key/value pairs, so the editor doesn't depend on your property names; the id property (`defect_id`, `cause_id`, …) is fixed once a node exists. Saving replaces all of a node's properties with what is shown; deleting a node also deletes its relationships (with a confirmation).

This page and `/api/graph` are public: there is no login, so anyone with the URL can change or delete graph data. Labels and relationship types are whitelisted in `lib/graph-schema.ts` (update it if your schema changes), and user input only reaches Cypher as parameters. The Neo4j user must have write access.

## Where things live

- `lib/defects.ts` – the defect dropdown list. Each `id` must equal the `Defect.defect_id` in the graph.
- `lib/neo4j.ts` – the KG query (`CAUSE_QUERY`). "Top k" is currently the first k causes ordered by `cause_id` because the graph has no ranking property; change the `ORDER BY` when it does.
- `lib/nvidia.ts` – the NVIDIA chat call.
- `lib/graph.ts`, `lib/graph-schema.ts`, `app/api/graph/route.ts`, `app/graph/page.tsx` – the graph editor.
- `lib/storage.ts` – Supabase image storage.
- `app/api/analyze/route.ts` – the pipeline (validate → store image → KG → predict).

## Time limits

Vercel kills a function at `maxDuration` (60 s here) and returns a non-JSON `FUNCTION_INVOCATION_TIMEOUT` 504. The pipeline therefore works inside a 55 s budget: Neo4j and Supabase calls get at most 8 s each (run in parallel), and the NVIDIA prediction gets what remains, up to `NVIDIA_TIMEOUT_MS` (default 40 s). If a stage times out, the response is JSON naming that stage.

## Debugging

Every response (success or failure) includes a `trace`: each stage's status, duration and inputs/outputs (validated input, KG query/parameters/causes). The UI shows it under "Pipeline trace". The server logs one JSON line per stage with the same `request_id`; images and keys are never logged.

- Bad input → `validate_input` failed (image type/size, unknown defect id, k out of range).
- Image not saved → check the `store_image` step (it shows the Supabase HTTP status).
- No causes → check `knowledge_graph`. When nothing matches, the trace also lists every `Defect` node in the graph (`defects_in_graph`) so you can compare ids with `lib/defects.ts`. A KG failure does not stop the pipeline; the UI warns that the prediction used the image alone.
- NVIDIA problems → `explain` shows the HTTP status, model and host, or the timeout.

Potential causes are unverified. Not a structural safety assessment.
