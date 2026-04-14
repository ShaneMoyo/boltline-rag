import "dotenv/config";
import { runRag } from "./rag.js";

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
  const { answer, sources } = await runRag({ question, topK });

  if (showSources) {
    console.error("\n--- Retrieved context (for debugging) ---");
    for (const s of sources) {
      console.error(`[${s.score.toFixed(4)}] ${s.sourcePath} #${s.chunkIndex}`);
    }
    console.error("--- End retrieved context ---\n");
  }

  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
