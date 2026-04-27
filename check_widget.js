const db = require('./db.js');
db.default.query('SELECT config_json FROM overlays WHERE public_id=$1', ['b362b028bbc29431ef2a5596'])
  .then(r => {
    const els = (r.rows[0].config_json.elements || []).filter(e => e.type === 'widget');
    console.log(JSON.stringify(els, null, 2));
    process.exit();
  });
