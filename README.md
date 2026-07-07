# GrowEasy CSV Importer

An AI-powered CSV-to-CRM importer. Upload any CSV — Facebook Lead Ads, Google Ads, real estate exports, or manual spreadsheets — and the AI maps arbitrary columns to a fixed CRM schema automatically.

## Repository structure

```text
csv_project/          ← npm workspace root
├── client/           ← Next.js 14 (App Router, TypeScript, Tailwind CSS)
├── server/           ← Express 4 (TypeScript) — REST API + AI extraction
└── shared/           ← Shared TypeScript types and schemas
```

## What's included

- `client/` — React-based uploader, preview, import workflow, and results UI
- `server/` — CSV parsing, AI provider orchestration, retries, and REST APIs
- `shared/` — shared CRM types, API contract types, and validation schemas

## Prerequisites

- Node.js v18+
- npm v9+

## Setup

```bash
npm install
```

Create local env files:

```bash
copy client\.env.example client\.env
copy server\.env.example server\.env
```

Then update `server/.env` with your chosen provider and API keys.

## Development

Run the server and client in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

The client is available at `http://localhost:3000` and the server at `http://localhost:4000`.

## Production deployment

When deployed, set the client to point at your live backend URL.

- Backend API: `https://grow-easy-server.vercel.app`
- Frontend app: `https://grow-easy-client.vercel.app`

In Vercel, configure `NEXT_PUBLIC_API_URL=https://grow-easy-server.vercel.app` for the frontend deployment.

## Build

```bash
npm run build
```

## Environment variables

### `server/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 4000) |
| `AI_PROVIDER` | Yes | `openai`, `gemini`, or `anthropic` |
| `OPENAI_API_KEY` | Conditionally | OpenAI secret key |
| `GEMINI_API_KEY` | Conditionally | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Conditionally | Anthropic API key |
| `CORS_ORIGINS` | No | Comma-separated origins (default: `http://localhost:3000`) |
| `RESTART_TOKEN` | No | Optional token for admin restart endpoint |
| `PROVIDER_MAX_RETRIES` | No | Retry attempts for provider errors |
| `PARSE_MAX_RETRIES` | No | Retry attempts for parse/validation failures |
| `AI_INTER_BATCH_DELAY_MS` | No | Delay between AI batches in ms |
| `AI_RATE_LIMIT_BACKOFF_MS` | No | Backoff base delay for rate limits |

### `client/.env`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Server URL, e.g. `http://localhost:4000` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/csv/parse` | Parse uploaded CSV and return preview data |
| `POST` | `/api/csv/import` | Import CSV via AI extraction into CRM records |

## Key features

- AI-based mapping of arbitrary CSV columns to a fixed CRM record schema
- CSV preview and import workflow in the client
- Robust provider retry/backoff handling for transient AI errors
- Skipped-row reporting with original row data for review
- Light/dark theme toggle and polished client UI

## Notes

- The server keeps data in memory per request and does not persist uploads.
- Shared types in `shared/` keep server and client contracts aligned.
- The client and server are intentionally separated so the AI extraction service can evolve independently.

## Useful commands

```bash
npm run dev:client
npm run dev:server
npm run build
npm test
```

## Recommended workflow

1. Start the server and client.
2. Upload a CSV from the client.
3. Review the CSV preview screen.
4. Confirm import and review the mapped CRM records.
5. Inspect skipped rows to understand missing or invalid data.
 
