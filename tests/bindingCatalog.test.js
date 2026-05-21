// Every SourceCatalog field must use id + path (no legacy key: fields).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/shared/bindingEngine.ts"), "utf8");

if (/\{\s*key:\s*['"]/.test(src)) {
  console.error("[bindingCatalog] bindingEngine.ts still contains key: field entries");
  process.exit(1);
}

const fieldBlocks = src.matchAll(/\{\s*id:\s*["']([^"']+)["'][^}]*path:\s*["']([^"']+)["']/g);
let count = 0;
for (const m of fieldBlocks) {
  count++;
  if (!m[1] || !m[2]) {
    console.error("[bindingCatalog] invalid field", m[0]);
    process.exit(1);
  }
}
if (count < 10) {
  console.error("[bindingCatalog] expected many id+path fields, found", count);
  process.exit(1);
}
console.log(`bindingCatalog: ok (${count} id+path fields)`);
