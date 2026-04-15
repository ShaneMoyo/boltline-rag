import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createOpenAIClient, embedTexts } from "./embed.js";
import type { PersistedIndex } from "./ingest.js";
import { INDEX_PATH } from "./paths.js";
import { retrieveByEmbedding } from "./rag.js";
import { cosineSimilarity, topKChunks } from "./retrieve.js";

/** Three chunks with deterministic cosine rankings for query [1,0,0]. */
function toyIndex(): PersistedIndex {
  return {
    embeddingModel: "eval-toy",
    createdAt: new Date().toISOString(),
    chunks: [
      {
        id: "c1",
        sourcePath: "docs/a.md",
        chunkIndex: 0,
        text: "Alpha topic about rockets.",
        embedding: [1, 0, 0],
      },
      {
        id: "c2",
        sourcePath: "docs/b.md",
        chunkIndex: 0,
        text: "Beta topic orthogonal to Alpha.",
        embedding: [0, 1, 0],
      },
      {
        id: "c3",
        sourcePath: "docs/c.md",
        chunkIndex: 0,
        text: "Gamma partially overlaps Alpha.",
        embedding: [0.6, 0.8, 0],
      },
    ],
  };
}

describe("RAG retrieval eval (synthetic embeddings)", () => {
  it("ranks exact embedding match first at recall@1", () => {
    const index = toyIndex();
    const q = [1, 0, 0];
    const out = retrieveByEmbedding(index, q, 3);
    expect(out[0]?.sourcePath).toBe("docs/a.md");
    expect(out[0]?.score).toBeCloseTo(1, 5);
  });

  it("returns scores in descending order", () => {
    const index = toyIndex();
    const q = [1, 0, 0];
    const out = retrieveByEmbedding(index, q, 3);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
    }
  });

  it("respects topK truncation", () => {
    const index = toyIndex();
    const out = retrieveByEmbedding(index, [1, 0, 0], 1);
    expect(out).toHaveLength(1);
  });

  it("matches topKChunks behavior for cosine pipeline", () => {
    const index = toyIndex();
    const q = [0, 1, 0];
    const direct = topKChunks(index, q, 2).map((h) => h.chunk.sourcePath);
    const viaRag = retrieveByEmbedding(index, q, 2).map((s) => s.sourcePath);
    expect(viaRag).toEqual(direct);
  });

  it("reports cosine in [-1, 1] for toy vectors", () => {
    const index = toyIndex();
    const out = retrieveByEmbedding(index, [1, 0, 0], 3);
    for (const s of out) {
      expect(s.score).toBeGreaterThanOrEqual(-1);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("orthogonal query has zero similarity with perpendicular chunk", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe("RAG smoke eval (live embeddings, optional)", () => {
  it.skipIf(!process.env.RUN_RAG_EVAL_LIVE || !process.env.OPENAI_API_KEY)(
    "embed query and retrieve from real index when present",
    async () => {
      if (!existsSync(INDEX_PATH)) {
        throw new Error(
          `Missing ${INDEX_PATH}. Run npm run rag:ingest first, or skip this test.`
        );
      }
      const raw = await readFile(INDEX_PATH, "utf8");
      const index = JSON.parse(raw) as PersistedIndex;
      if (index.chunks.length === 0) {
        throw new Error("Index has no chunks.");
      }

      const client = createOpenAIClient();
      const question = "What is documented in the corpus?";
      const [qEmb] = await embedTexts(client, [question], index.embeddingModel);
      const sources = retrieveByEmbedding(index, qEmb!, 5);

      expect(sources.length).toBeGreaterThan(0);
      expect(sources.length).toBeLessThanOrEqual(5);
      for (const s of sources) {
        expect(s.sourcePath).toBeTruthy();
        expect(s.text.length).toBeGreaterThan(0);
        expect(s.score).toBeGreaterThanOrEqual(-1);
        expect(s.score).toBeLessThanOrEqual(1);
      }
      // Top result should align best with itself
      const self = index.chunks.find(
        (c) => c.sourcePath === sources[0]?.sourcePath && c.chunkIndex === sources[0]?.chunkIndex
      );
      expect(self).toBeDefined();
      if (self) {
        const sim = cosineSimilarity(qEmb!, self.embedding);
        expect(sim).toBeCloseTo(sources[0]!.score, 5);
      }
    },
    60_000
  );
});
