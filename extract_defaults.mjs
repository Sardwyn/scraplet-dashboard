/**
 * Extracts configSchema defaults from allWidgets.ts and writes widgetDefaults.json.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, 'src/widgets/allWidgets.ts'), 'utf8');

const defaults = {};

// Split by registerWidget calls
const blocks = src.split(/registerWidget\s*\(\s*\{/);

for (const block of blocks.slice(1)) {
  // Extract widget id
  const idMatch = block.match(/id:\s*['"]([^'"]+)['"]/);
  if (!idMatch) continue;
  const id = idMatch[1];

  // Extract configSchema block - find the array
  const schemaStart = block.indexOf('configSchema:');
  if (schemaStart === -1) { defaults[id] = {}; continue; }

  // Find the [ that starts the array
  let arrayStart = block.indexOf('[', schemaStart);
  if (arrayStart === -1) { defaults[id] = {}; continue; }

  // Find matching ]
  let depth = 1;
  let i = arrayStart + 1;
  while (i < block.length && depth > 0) {
    if (block[i] === '[') depth++;
    else if (block[i] === ']') depth--;
    i++;
  }
  const arrayEnd = i - 1;
  const schemaStr = block.slice(arrayStart + 1, arrayEnd);

  const fieldDefaults = {};

  // Use regex to find all { key: '...', ..., default: ... } entries
  // Match each field object
  const fieldRegex = /\{\s*key:\s*['"]([^'"]+)['"][^}]*?default:\s*([^,}\n]+)/g;
  let m;
  while ((m = fieldRegex.exec(schemaStr)) !== null) {
    const key = m[1];
    let val = m[2].trim().replace(/,$/, '').trim();

    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      fieldDefaults[key] = val.slice(1, -1);
    } else if (val === 'true') {
      fieldDefaults[key] = true;
    } else if (val === 'false') {
      fieldDefaults[key] = false;
    } else if (val === 'null') {
      fieldDefaults[key] = null;
    } else if (!isNaN(Number(val))) {
      fieldDefaults[key] = Number(val);
    } else {
      fieldDefaults[key] = val;
    }
  }

  defaults[id] = fieldDefaults;
}

const outPath = path.join(__dirname, 'src/widgets/widgetDefaults.json');
writeFileSync(outPath, JSON.stringify(defaults, null, 2));
console.log('widgetDefaults.json written with', Object.keys(defaults).length, 'widgets');
for (const [id, d] of Object.entries(defaults)) {
  if (Object.keys(d).length > 0) {
    console.log(` ${id}: ${Object.keys(d).length} defaults - sample:`, JSON.stringify(d).slice(0, 80));
  } else {
    console.log(` ${id}: 0 defaults`);
  }
}
