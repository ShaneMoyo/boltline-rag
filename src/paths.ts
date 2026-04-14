import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package root (directory containing corpus/, data/, etc.) */
export const PROJECT_ROOT = join(__dirname, "..");

export const CORPUS_DIR = join(PROJECT_ROOT, "corpus");
export const INDEX_PATH = join(PROJECT_ROOT, "data", "index.json");
export const CLIENT_DIST = join(PROJECT_ROOT, "client", "dist");
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package root (directory containing corpus/, data/, etc.) */
export const PROJECT_ROOT = join(__dirname, "..");

export const CORPUS_DIR = join(PROJECT_ROOT, "corpus");
export const INDEX_PATH = join(PROJECT_ROOT, "data", "index.json");
export const CLIENT_DIST = join(PROJECT_ROOT, "client", "dist");
