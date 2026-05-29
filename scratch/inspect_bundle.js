import fs from 'fs';
import path from 'path';

const bundlePath = 'public/static/overlays/overlay-runtime.bundle.js';

if (!fs.existsSync(bundlePath)) {
  console.error(`File not found: ${bundlePath}`);
  process.exit(1);
}

const content = fs.readFileSync(bundlePath, 'utf8');

// Search for ?? (Nullish coalescing)
const nullishCoalescing = [];
let pos = 0;
while (true) {
  const index = content.indexOf('??', pos);
  if (index === -1) break;
  // Get some surrounding context
  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + 40);
  nullishCoalescing.push({
    index,
    context: content.substring(start, end).replace(/\n/g, ' ')
  });
  pos = index + 2;
}

console.log(`Found ${nullishCoalescing.length} occurrences of Nullish Coalescing (??):`);
nullishCoalescing.slice(0, 20).forEach((match, i) => {
  console.log(`  ${i + 1}: ...${match.context}... (at index ${match.index})`);
});

// Search for logical assignments (||=, &&=, ??=)
const logicalOrAssign = content.includes('||=');
const logicalAndAssign = content.includes('&&=');
const nullishAssign = content.includes('??=');
console.log(`Logical Or Assignment (||=) found: ${logicalOrAssign}`);
console.log(`Logical And Assignment (&&=) found: ${logicalAndAssign}`);
console.log(`Nullish Assignment (??=) found: ${nullishAssign}`);

// Search for any other potentially unsupported ES2020 features like optional chaining
// Note: Optional chaining can be hard to match with a simple regex/string search due to floats and ternary operators,
// but we can look for ?. followed by non-digits
const optionalChainingMatches = content.match(/\?\.[a-zA-Z_$]/g) || [];
console.log(`Found ${optionalChainingMatches.length} occurrences of optional chaining (?.)`);
if (optionalChainingMatches.length > 0) {
  console.log('Sample optional chaining matches:', optionalChainingMatches.slice(0, 10));
}
