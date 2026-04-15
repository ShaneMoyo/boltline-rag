import { readFile } from "node:fs/promises";
import { createOpenAIClient, embedTexts } from "./embed.js";
import type { PersistedIndex } from "./ingest.js";
import { INDEX_PATH } from "./paths.js";
import { topKChunks } from "./retrieve.js";

export type RagSource = {
  sourcePath: string;
  chunkIndex: number;
  score: number;
  text: string;
};

/** Pure retrieval step: rank chunks by cosine similarity to a query embedding (for tests and eval). */
export function retrieveByEmbedding(
  index: PersistedIndex,
  queryEmbedding: number[],
  topK: number
): RagSource[] {
  const hits = topKChunks(index, queryEmbedding, topK);
  return hits.map(({ chunk, score }) => ({
    sourcePath: chunk.sourcePath,
    chunkIndex: chunk.chunkIndex,
    score,
    text: chunk.text,
  }));
}

export async function runRag(options: {
  question: string;
  topK?: number;
}): Promise<{ answer: string; sources: RagSource[] }> {
  const topK = options.topK ?? 5;
  const raw = await readFile(INDEX_PATH, "utf8");
  const index = JSON.parse(raw) as PersistedIndex;

  const client = createOpenAIClient();
  const [qEmb] = await embedTexts(client, [options.question], index.embeddingModel);
  const sources = retrieveByEmbedding(index, qEmb!, topK);

  const contextBlock = sources
    .map(
      (s, i) => `### Snippet ${i + 1} (source: ${s.sourcePath})\n${s.text}`
    )
    .join("\n\n");

  const chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model: chatModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant for Stoke Space and Boltline. Answer using ONLY the provided context snippets when they are relevant. If the context is insufficient, say so briefly and suggest what documentation would be needed.",
      },
      {
        role: "user",
        content: `Question:\n${options.question}\n\nContext snippets:\n${contextBlock}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  return { answer, sources };
}
