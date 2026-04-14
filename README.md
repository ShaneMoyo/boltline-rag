# Boltline RAG

A **Retrieval-Augmented Generation (RAG)** application for Stoke Space and Boltline, built with TypeScript, Express, and React. Users sign in with Google, ask questions, and receive answers grounded in the local markdown corpus.

## How it works

1. **Ingest:** `corpus/*.md` is chunked, embedded via OpenAI, and written to `data/index.json`.
2. **Query:** The question is embedded; cosine similarity retrieves top-k chunks; the LLM answers with those snippets as context.
3. **Auth:** Google Sign-In authenticates users; the server verifies the ID token, creates a session, and guards `/api/ask`.
4. **Rate limiting:** 20 requests per IP per 15 minutes on `/api/ask`.

## Prerequisites

- Node.js 20+
- An OpenAI API key with billing enabled
- A Google OAuth 2.0 Client ID (see setup below)

## Google Client ID setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Add to **Authorized JavaScript origins**:
   - `http://localhost:5173` (local dev)
   - `https://your-deployed-app.com` (production)
6. Copy the **Client ID** (looks like `1234567890-abc.apps.googleusercontent.com`)

### Troubleshooting Google Sign-In

- **`The given origin is not allowed for the given client ID`** — In Google Cloud Console, open your OAuth **Web client**, edit **Authorized JavaScript origins**, and add **exactly** `http://localhost:5173` (no trailing slash). Save, wait a minute, then hard-refresh the app.
- **`initialize() is called multiple times`** — Fixed in the app by initializing GSI once; if you still see it, do a full page reload after changing env.
- **`500` on `/api/auth/*`** — Run **`npm run dev`** so both the API (port 3001) and Vite (5173) are up. Do not run only `npm run dev:client` unless you point the API elsewhere.

## Setup

```bash
# Root env
cp .env.example .env

# Client env
cp client/.env.example client/.env
```

Edit both `.env` files and set:

| File | Variable | Value |
|------|----------|-------|
| `.env` | `OPENAI_API_KEY` | Your OpenAI key |
| `.env` | `SESSION_SECRET` | Run: `openssl rand -hex 32` |
| `.env` | `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `client/.env` | `VITE_GOOGLE_CLIENT_ID` | Same value as `GOOGLE_CLIENT_ID` |

Then install and build the index:

```bash
npm install
npm run rag:ingest
```

## Usage

### Local development

```bash
npm run dev
# API  → http://localhost:3001
# UI   → http://localhost:5173 (proxies /api → 3001)
```

### CLI (no UI)

```bash
npm run rag:ask -- "What is Boltline?"
npm run rag:ask -- "How does traceability work?" --top-k 3
```

### Production

```bash
npm run build   # builds client/dist
npm start       # serves API + static UI on PORT (default 3001)
```

## Deployment (Railway / Render / Fly.io)

Set these environment variables on the host:

- `OPENAI_API_KEY`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `NODE_ENV=production`
- `PORT` (usually auto-set by the host)

The build command is `npm run build` and the start command is `npm start`.

The `VITE_GOOGLE_CLIENT_ID` variable must be set **at build time** (it's baked into the client bundle). On Railway/Render, add it as an env var before triggering a build.

## Security notes

- Sessions are HTTP-only cookies; in production they are `secure` + `sameSite: strict`.
- `/api/ask` requires a valid session — unauthenticated requests get `401`.
- Rate limiting caps abuse at 20 requests / 15 min per IP.
- Set a hard **monthly spending limit** on your OpenAI account as a final backstop.
- Never commit `.env` files — they are gitignored.

## Corpus and limitations

The demo corpus in `corpus/` is original summary text about Stoke Space and Boltline. It is not an official source. Extend it with documents you have rights to index.

See [`SOURCES.md`](SOURCES.md) for suggested public reading.
