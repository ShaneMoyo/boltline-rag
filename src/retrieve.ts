import type { PersistedChunk, PersistedIndex } from "./ingest.js";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function topKChunks(
  index: PersistedIndex,
  queryEmbedding: number[],
  k: number
): { chunk: PersistedChunk; score: number }[] {
  const scored = index.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, k);
}
