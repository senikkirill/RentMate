import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "packages/domain/dist");
const dest = resolve(root, "legacy/functions/api/_domain");

if (!existsSync(src)) {
  console.error("Missing packages/domain/dist — run: npm run build -w @rentmate/domain");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied @rentmate/domain dist → legacy/functions/api/_domain");
