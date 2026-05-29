import fs from 'fs';

const code = fs.readFileSync('public/static/overlays/overlay-runtime.bundle.js', 'utf8');
let idx = -1;
let count = 0;
while ((idx = code.indexOf('_e', idx + 1)) !== -1) {
  count++;
  if (count <= 100) {
    const start = Math.max(0, idx - 80);
    const end = Math.min(code.length, idx + 80);
    console.log(`Match ${count} at index ${idx}:`);
    console.log(code.substring(start, end));
    console.log('-'.repeat(40));
  }
}
console.log(`Total matches of '_e': ${count}`);
