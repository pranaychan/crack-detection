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

## 2. Prepare the Neo4j graph

This app expects these labels, properties, and relationship types:

- `(:DefectCase {case_id, building_type, observed_symptoms, evidence_status, screening_priority, evidence_notes, suggested_follow_up, source_type, potential_causes_unverified})`
- `(:CrackType {name})`
- `(:Component {name})`
- `(:PotentialCause {name})`
- `(:DefectCase)-[:HAS_CRACK_TYPE]->(:CrackType)`
- `(:DefectCase)-[:OCCURS_ON]->(:Component)`
- `(:DefectCase)-[:MAY_BE_ASSOCIATED_WITH]->(:PotentialCause)`

Run `scripts/schema.cypher` in Neo4j Browser. Then import `data/synthetic_crack_defect_cases.csv` using `scripts/import-cases.cypher` if the CSV is available to the Neo4j server through its import directory. Neo4j Aura cannot read a local `file:///` path from your computer; for Aura, upload the CSV to an approved reachable location or use a one-off Python/JavaScript driver import script.

The API queries these exact relationship names. If your graph has different names, either update the Cypher in `lib/neo4j.ts` or change the graph to match.

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
6. Try a short text description in the UI.

Your Neo4j database must be reachable from Vercel over the network. For Aura, use the Aura connection URI and credentials. Avoid IP allowlists that block Vercel serverless egress; use a secure supported networking configuration for your deployment.

## 5. API

### `POST /api/analyze`

JSON body:

```json
{
  "description": "Diagonal crack from a window corner in a masonry wall",
  "imageDataUrl": "data:image/jpeg;base64,..."
}
```

`imageDataUrl` is optional. Images must be an image data URL and approximately 3 MB or smaller. Response contains extracted observations, whether the graph was queried, related graph cases, a generated summary, and limitations.

### `GET /api/health`

Returns application status, whether the NVIDIA API key exists, and Neo4j connectivity/case count. It does not expose secret values.

## Design / security notes

- NVIDIA and Neo4j credentials are only read by server-side code.
- User input is passed as parameters to a fixed, read-only Cypher query; users cannot submit arbitrary Cypher.
- The model's extracted fields are treated as search hints, not trusted ground truth.
- The app only retrieves graph cases; it does not write LLM-generated diagnoses into Neo4j.
- Do not rely on the synthetic `screening_priority` as a validated risk rating.
- Add authentication, rate limiting, monitoring, and privacy review before public production use.
