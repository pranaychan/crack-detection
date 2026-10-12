# CrackScope — Construction Crack Analysis + Neo4j Knowledge Graph

A Next.js application designed for Vercel. It uses NVIDIA's OpenAI-compatible API (`deepseek-ai/deepseek-v4.1-flash`) to extract crack observations from text and optional images, retrieves related cases from Neo4j using fixed parameterised Cypher, and asks the model to summarise the retrieved evidence.

> Safety: this is a prototype for decision support. It does not certify structural safety or prove root causes. The bundled cases are synthetic and must not be presented as real inspections.

## Stack

- Next.js App Router + TypeScript
- NVIDIA API through the OpenAI JavaScript SDK
- Neo4j official JavaScript driver
- Vercel deployment

## 1. Configure environment variables

Copy `.env.example` to `.env.local` for local development and fill in values:

- `NVIDIA_API_KEY`: your NVIDIA API key
- `NVIDIA_BASE_URL`: usually `https://integrate.api.nvidia.com/v1`
- `NVIDIA_MODEL`: defaults to `deepseek-ai/deepseek-v4.1-flash`
- `NEO4J_URI`: Aura `neo4j+s://...` or local `bolt://localhost:7687`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE`: usually `neo4j`

Never prefix secrets with `NEXT_PUBLIC_`; that exposes them to client-side code. Do not commit `.env.local`.

## 2. Existing Neo4j Aura graph schema

This app queries the existing graph using these exact labels, properties and relationship types:

- `(:Defect_Case {case_id, building_type, observed_symptoms, evidence_status, screening_priority, evidence_notes, suggested_follow_up})`
- `(:Component {component})`
- `(:Crack_Type {crack_type})`
- `(:Potential_cause {potential_causes_unverified})`
- `(:Defect_Case)-[:What_Component]->(:Component)`
- `(:Defect_Case)-[:What_Crack]->(:Crack_Type)`
- `(:Crack_Type)-[:What_Cause]->(:Potential_cause)`

The frontend accepts an image only. NVIDIA returns the crack type and component it actually observes, in plain language, even if a label is not in the knowledge graph vocabulary. The server separately checks whether both labels match supported graph values. Only then does it run a parameterised, read-only exact-match query against Aura. If either label is not represented, the app displays the model detection and explains that no graph lookup was performed instead of silently forcing the result into a different label.

The app does not initialise or write to the graph. `scripts/schema.cypher` and `scripts/import-cases.cypher` are optional reference scripts only; they are not part of the deployment workflow. Aura cannot read a `file:///` path on your desktop.

## 3. Environment variables

Set `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE`. The app does not need `AURA_INSTANCEID` or `AURA_INSTANCENAME`.

## 3. Run locally

Requires Node.js 20 or later recommended.

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your actual credentials
npm run dev
```

Open http://localhost:3000.

Health endpoint: http://localhost:3000/api/health. It reports whether the NVIDIA key is configured and whether Neo4j can be reached. It does not return credentials.

## 4. Deploy to Vercel

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. In Project Settings → Environment Variables, add `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE` for Preview and Production as appropriate.
4. Deploy. Vercel detects Next.js automatically; no custom build command should be needed (`npm run build`).
5. Visit `/api/health`. Confirm `nvidia_configured` is `true` and `neo4j.connected` is `true`.
6. Upload a clear crack image in the UI.

Your Neo4j database must be reachable from Vercel over the network. For Aura, use the Aura connection URI and credentials. Avoid IP allowlists that block Vercel serverless egress; use a secure supported networking configuration for your deployment.

## 5. API

### `POST /api/analyze`

JSON body:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

An image is required and must be an image data URL of approximately 2.8 MB or smaller. The response contains the presumed crack type and component, matching graph cases, potential causes and limitations.

### `GET /api/health`

Returns application status, whether the NVIDIA API key exists, and Neo4j connectivity/case count. It does not expose secret values.

## Design / security notes

- NVIDIA and Neo4j credentials are only read by server-side code.
- User input is passed as parameters to a fixed, read-only Cypher query; users cannot submit arbitrary Cypher.
- The model's extracted fields are treated as search hints, not trusted ground truth.
- The app only retrieves graph cases; it does not write LLM-generated diagnoses into Neo4j.
- Do not rely on the synthetic `screening_priority` as a validated risk rating.
- Add authentication, rate limiting, monitoring, and privacy review before public production use.


## Pipeline inspector UI

The homepage has four tabs: **Image input**, **AI prediction**, **Data sent to Neo4j**, and **Output from Neo4j**. After an analysis completes, the API response includes safe pipeline-debug fields used to populate these tabs: image metadata/instruction, structured AI output, the parameterised Cypher query and graph parameters, and the returned case rows. The original image bytes and API credentials are not echoed in the debug response. The UI uses a high-contrast navy/blue/acid-yellow palette.
