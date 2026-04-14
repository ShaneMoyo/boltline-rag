import { describe, expect, it } from "vitest";
import type { PersistedIndex } from "./ingest.js";
import { cosineSimilarity, topKChunks } from "./retrieve.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    const a = [1, 0, 0];
    expect(cosineSimilarity(a, a)).toBe(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("handles zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe("topKChunks", () => {
  const index: PersistedIndex = {
    embeddingModel: "test",
    createdAt: "",
    chunks: [
      { id: "1", sourcePath: "a.md", chunkIndex: 0, text: "a", embedding: [1, 0, 0] },
      { id: "2", sourcePath: "b.md", chunkIndex: 0, text: "b", embedding: [0, 1, 0] },
      { id: "3", sourcePath: "c.md", chunkIndex: 0, text: "c", embedding: [0.7, 0.7, 0] },
    ],
  };

  it("returns at most k chunks sorted by descending score", () => {
    const q = [1, 0, 0];
    const hits = topKChunks(index, q, 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
    expect(hits[0]!.chunk.id).toBe("1");
  });

  it("respects k smaller than chunk count", () => {
    const hits = topKChunks(index, [0, 1, 0], 1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.chunk.id).toBe("2");
  });
});
