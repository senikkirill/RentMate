import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "legacy/miniapp/index.html",
  "legacy/functions/api/index.ts",
  "legacy/functions/bot/index.ts",
  "legacy/sql/001_multitenant.sql",
];

const missing = required.filter((rel) => !existsSync(resolve(root, rel)));
if (missing.length) {
  console.error("Legacy files missing:", missing.join(", "));
  process.exit(1);
}
console.log("Legacy application files present.");
