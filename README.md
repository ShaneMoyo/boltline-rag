# Boltline / Stoke Space RAG demo

Small **Retrieval-Augmented Generation (RAG)** demo in TypeScript: chunk public-themed markdown in `corpus/`, embed with an OpenAI-compatible API, persist vectors to `data/index.json`, then answer questions with **retrieve → prompt → chat**.

This is intended for **interview preparation** and portfolio discussion—not a production Boltline integration. Answers are only as good as the text you put in `corpus/`.

## Prerequisites

- Node.js 20+ (or compatible runtime)
- An API key for an OpenAI-compatible service with **embeddings** and **chat completions**

## Setup

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
npm install
```

## Usage

Build the vector index from `corpus/*.md`:

```bash
npm run rag:ingest
```

Ask a question (retrieval runs against `data/index.json`):

```bash
npm run rag:ask -- "What is Boltline and how does traceability show up in the messaging?"
```

Options:

- `--top-k` / `-k` — number of chunks to retrieve (default: 5)
- `--no-sources` — hide the stderr dump of retrieved snippets (stdout is still the model answer)

## How it works

1. **Ingest:** Markdown is split into overlapping chunks ([`src/chunk.ts`](src/chunk.ts)), embedded ([`src/embed.ts`](src/embed.ts)), and written to [`data/index.json`](data/index.json) ([`src/ingest.ts`](src/ingest.ts)).
2. **Query:** The question is embedded with the **same** embedding model recorded in the index; cosine similarity picks top‑k chunks ([`src/retrieve.ts`](src/retrieve.ts)); the LLM answers with those snippets as context ([`src/query.ts`](src/query.ts)).

## Corpus and limitations

- The demo corpus is **original summary text** for study purposes. Extend it with facts you verify, or with documents you have rights to index.
- See [`SOURCES.md`](SOURCES.md) for suggested public pages to read; do not assume this repo’s text is an official Boltline or Stoke Space source of truth.

## Interview talking points

- **RAG** grounds the model on *your* documents, which reduces hallucinations versus a bare chat model on proprietary domains.
- **Chunking and metadata** (here: source path + chunk index) matter for traceability of *why* an answer was produced—similar in spirit to hardware traceability themes in Boltline’s public story.
- **Operational gaps:** production RAG adds auth, evaluation, re-ingest pipelines, hybrid search, and monitoring—this repo stays intentionally small.
