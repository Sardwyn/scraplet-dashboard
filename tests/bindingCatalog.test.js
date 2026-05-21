// Every SourceCatalog field must have id + path for resolveBinding.
import { SourceCatalog } from "../src/shared/bindingEngine.ts";

let failed = 0;
for (const source of SourceCatalog) {
  for (const field of source.fields) {
    if (!field.id) {
      console.error(`[bindingCatalog] ${source.id}: field missing id`, field);
      failed++;
    }
    if (!field.path) {
      console.error(`[bindingCatalog] ${source.id}.${field.id}: missing path`);
      failed++;
    }
  }
}
if (failed > 0) process.exit(1);
console.log(`bindingCatalog: ok (${SourceCatalog.length} sources)`);
