const fs = require('fs');
fs.writeFileSync('public/static/overlays/build-stamp.json', JSON.stringify({buildTime: Date.now(), built: new Date().toISOString()}));
console.log('stamp written:', fs.readFileSync('public/static/overlays/build-stamp.json', 'utf8'));
