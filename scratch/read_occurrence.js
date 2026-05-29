import fs from 'fs';

const content = fs.readFileSync('public/static/overlays/overlay-runtime.bundle.js', 'utf8');
const index = 2130553;
const start = Math.max(0, index - 200);
const end = Math.min(content.length, index + 200);
console.log(content.substring(start, end));
