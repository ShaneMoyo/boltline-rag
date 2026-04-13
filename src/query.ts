import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAIClient, embedTexts } from "./embed.js";
import type { PersistedIndex } from "./ingest.js";
import { topKChunks } from "./retrieve.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "data", "index.json");

function parseArgs(argv: string[]): { question: string; topK: number; showSources: boolean } {
  let topK = 5;
  let showSources = true;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--top-k" || a === "-k") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --top-k");
      topK = Number(v);
      if (!Number.isFinite(topK) || topK < 1) throw new Error("Invalid --top-k");
      continue;
    }
    if (a === "--no-sources") {
      showSources = false;
      continue;
    }
    rest.push(a);
  }
  const question = rest.join(" ").trim();
  if (!question) {
    throw new Error(
      'Usage: npm run rag:ask -- "Your question" [--top-k 5] [--no-sources]'
    );
  }
  return { question, topK, showSources };
}

async function main(): Promise<void> {
  const { question, topK, showSources } = parseArgs(process.argv.slice(2));

  const raw = await readFile(INDEX_PATH, "utf8");
  const index = JSON.parse(raw) as PersistedIndex;

  const client = createOpenAIClient();
  const [qEmb] = await embedTexts(client, [question], index.embeddingModel);
  const hits = topKChunks(index, qEmb!, topK);

  if (showSources) {
    console.error("\n--- Retrieved context (for debugging) ---");
    for (const { chunk, score } of hits) {
      console.error(`[${score.toFixed(4)}] ${chunk.sourcePath} #${chunk.chunkIndex}`);
    }
    console.error("--- End retrieved context ---\n");
  }

  const contextBlock = hits
    .map(
      (h, i) =>
        `### Snippet ${i + 1} (source: ${h.chunk.sourcePath})\n${h.chunk.text}`
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
          "You are a helpful assistant for interview preparation about Stoke Space and Boltline. Answer using ONLY the provided context snippets when they are relevant. If the context is insufficient, say so briefly and suggest what documentation would be needed.",
      },
      {
        role: "user",
        content: `Question:\n${question}\n\nContext snippets:\n${contextBlock}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
