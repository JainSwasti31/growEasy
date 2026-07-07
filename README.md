# GrowEasy CSV Importer

An AI-powered CSV-to-CRM importer. Upload any CSV — Facebook Lead Ads, Google Ads, real estate exports, manual spreadsheets — and the AI maps arbitrary columns to a fixed CRM schema automatically.

---

## Architecture

```
csv_project/          ← npm workspace root
├── client/           ← Next.js 14 (App Router, TypeScript, Tailwind CSS)
├── server/           ← Express 4 (TypeScript) — REST API + AI extraction
└── shared/           ← Shared TypeScript types (CRM schema, API contracts)
```

**Why Express in `/server` instead of Next.js API routes?**  
The AI extraction pipeline involves heavy, stateful async work (batched LLM calls, retries, token tracking). Keeping it in a dedicated Express server gives clean separation of concerns, easier independent scaling/deployment, and lets us add streaming (Phase 7) without fighting Next.js's edge/serverless constraints.

**AI provider abstraction:**  
The server uses an `AI_PROVIDER` env var to select between OpenAI, Gemini, and Anthropic behind a common `aiExtractor` interface. Swapping providers requires only a new adapter — no prompt or routing changes.

---

## Prerequisites

- Node.js v18+
- npm v9+ (pnpm works too if installed)

---

## Setup

```bash
# 1. Clone and install all workspace dependencies
npm install

# 2. Configure environment variables
cp client/.env.example client/.env.local
cp server/.env.example server/.env
# Edit server/.env — set AI_PROVIDER and the matching API key
```

---

## Running in development

```bash
# Terminal 1 — Express server (http://localhost:4000)
npm run dev:server

# Terminal 2 — Next.js client (http://localhost:3000)
npm run dev:client
```

Or run both with a split-terminal tool:
```bash
npm run dev   # starts both concurrently (Windows: may need concurrently package)
```

---

## Environment variables

### `server/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 4000) |
| `AI_PROVIDER` | Yes | `openai` \| `gemini` \| `anthropic` |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI secret key |
| `GEMINI_API_KEY` | If using Gemini | Google AI Studio key |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic secret key |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:3000`) |

### `client/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | URL of the Express server (default: `http://localhost:4000`) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check → `{ status: "ok" }` |
| `POST` | `/api/csv/parse` | Parse CSV → raw headers + preview rows *(Phase 3)* |
| `POST` | `/api/csv/import` | Parse + AI-extract → CRM records + skipped rows *(Phase 5)* |

---

## Build

```bash
npm run build   # builds shared → client → server in dependency order
```

---

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Project scaffold | ✅ Done |
| 1 | Frontend: CSV upload component | 🔜 |
| 2 | Frontend: CSV preview table | 🔜 |
| 3 | Backend: CSV parse endpoint | 🔜 |
| 4 | Backend: AI field-mapping extraction | 🔜 |
| 5 | End-to-end wiring | 🔜 |
| 6 | Robustness & edge cases | 🔜 |
| 7 | Bonus polish | 🔜 |

---

## Design decisions (to be expanded per phase)

- **Stateless server:** The server never persists uploaded files or parsed data. Everything lives in memory per-request, keeping the server horizontally scalable and removing any storage concerns.
- **Shared types package:** `@groweasy/shared` holds Zod schemas and TypeScript types for both the CRM record and API contracts. Both client and server import from it, so request/response shapes can never drift out of sync.
- **Batched AI calls:** Large CSVs are split into batches of ~20–50 rows before being sent to the LLM, balancing token limits against too many API round trips. (Details in Phase 4.)

---

## Stage D — Retry + UI (Completed)

- **What was added:**
	- Server-side provider retry/backoff heuristics (`withRetry`) to robustly handle 429s and transient failures.
	- Configurable env vars to tune retries/backoff: `PROVIDER_MAX_RETRIES`, `PARSE_MAX_RETRIES`, `AI_INTER_BATCH_DELAY_MS`, `AI_RATE_LIMIT_BACKOFF_MS` (see `server/.env.example`).
	- `POST /api/csv/retry` endpoint to reprocess skipped rows (server).
	- Frontend `ImportResults` UI: button to "Retry failed rows" which calls the retry endpoint and merges results client-side.
	- `server/src/scripts/checkProvider.ts` smoke-test CLI to validate provider connectivity and keys.
	- Admin restart hook (`/admin/restart`) guarded by `RESTART_TOKEN` for quick env reloads in dev.
	- `server/Dockerfile`, `client/Dockerfile`, `.dockerignore`, and `docker-compose.yml` added to enable local containerized dev.

### How to test Stage D locally (safe, minimal):

1. Create local env files from examples (do NOT commit real keys):

```powershell
copy server\.env.example server\.env
copy client\.env.example client\.env
# Edit server\.env to set AI_PROVIDER and keys (or leave keys blank to avoid external calls)
```

2. Build and run containers (or run dev servers if you prefer):

```bash
docker-compose up --build
# or
npm run dev:server
npm run dev:client
```

3. Verify server health:

```bash
curl http://localhost:4000/api/health
```

4. Run provider smoke-test (light check):

```bash
# from project root
docker-compose run --rm server npm run check:provider
```

5. Try a small import (beware of provider quota):

```bash
curl -X POST -F "file=@server/test-samples/basic.csv" http://localhost:4000/api/csv/import
```

If the response contains skipped rows with `ai_validation_failed`, open the client UI → Import Results → click "Retry failed rows" to re-run them via the retry endpoint.

---

## Stage F — README & Tests (Next)

Planned checklist for Stage F (I can start these now):

- Update `README.md` with Stage D runbook and testing instructions. (in-progress)
- Add unit test for `parseAndValidate()` to assert `sourceRowIndex` mapping and retry behavior.
- Add unit test for `parseAndValidate()` to assert `sourceRowIndex` mapping and retry behavior.
- Run the full test suite and fix any failing tests discovered.
- Add a GitHub Actions workflow to run tests on push/PR.

If you want me to begin, I can implement the `mock` provider first (safe local testing), then the unit test for `parseAndValidate()`, and run the test suite. Proceed? 
