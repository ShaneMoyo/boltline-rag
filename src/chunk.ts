export type TextChunk = {
  id: string;
  text: string;
  sourcePath: string;
  chunkIndex: number;
};

const DEFAULT_MAX_CHARS = 1400;
const DEFAULT_OVERLAP = 200;

function splitParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitBySize(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    parts.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return parts.filter(Boolean);
}

export function chunkMarkdown(
  sourcePath: string,
  markdown: string,
  options?: { maxChars?: number; overlap?: number }
): TextChunk[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const paragraphs = splitParagraphs(markdown);
  const rawPieces: string[] = [];
  for (const p of paragraphs) {
    rawPieces.push(...splitBySize(p, maxChars, overlap));
  }
  return rawPieces.map((text, chunkIndex) => ({
    id: `${sourcePath}#${chunkIndex}`,
    text,
    sourcePath,
    chunkIndex,
  }));
}
