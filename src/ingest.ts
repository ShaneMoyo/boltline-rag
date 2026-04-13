import "dotenv/config";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkMarkdown } from "./chunk.js";
import { createOpenAIClient, embedTexts } from "./embed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CORPUS_DIR = join(ROOT, "corpus");
const INDEX_PATH = join(ROOT, "data", "index.json");

export type PersistedChunk = {
  id: string;
  sourcePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
};

export type PersistedIndex = {
  embeddingModel: string;
  createdAt: string;
  chunks: PersistedChunk[];
};

async function listCorpusMarkdown(): Promise<string[]> {
  const names = await readdir(CORPUS_DIR);
  return names
    .filter((n) => n.endsWith(".md"))
    .map((n) => join(CORPUS_DIR, n))
    .sort();
}

async function main(): Promise<void> {
  const embeddingModel =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const paths = await listCorpusMarkdown();
  if (paths.length === 0) {
    console.error(`No .md files found under ${CORPUS_DIR}`);
    process.exit(1);
  }

  const allChunks: ReturnType<typeof chunkMarkdown> = [];
  for (const filePath of paths) {
    const rel = relative(ROOT, filePath);
    const raw = await readFile(filePath, "utf8");
    allChunks.push(...chunkMarkdown(rel, raw));
  }

  console.error(`Chunked ${allChunks.length} segments from ${paths.length} files.`);

  const client = createOpenAIClient();
  const embeddings = await embedTexts(
    client,
    allChunks.map((c) => c.text),
    embeddingModel
  );

  const chunks: PersistedChunk[] = allChunks.map((c, i) => ({
    id: c.id,
    sourcePath: c.sourcePath,
    chunkIndex: c.chunkIndex,
    text: c.text,
    embedding: embeddings[i]!,
  }));

  const index: PersistedIndex = {
    embeddingModel,
    createdAt: new Date().toISOString(),
    chunks,
  };

  await mkdir(dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index), "utf8");
  console.error(`Wrote ${chunks.length} vectors to ${relative(ROOT, INDEX_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
