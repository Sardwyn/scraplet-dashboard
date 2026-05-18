import 'dotenv/config';
import db from './db.js';
db.query('SELECT * FROM scrapbot_commands WHERE name = $1 OR trigger_pattern ILIKE $2', ['stats', '%stats%'])
  .then(r => console.log(r.rows))
  .catch(e => console.error(e))
  .finally(() => process.exit(0));
