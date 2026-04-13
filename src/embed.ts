import OpenAI from "openai";

export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for embeddings (set it in .env or the environment).");
  }
  const baseURL = process.env.OPENAI_BASE_URL;
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

export async function embedTexts(
  client: OpenAI,
  texts: string[],
  model: string
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batchSize = 64;
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await client.embeddings.create({ model, input: batch });
    const ordered = res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
    all.push(...ordered);
  }
  return all;
}
