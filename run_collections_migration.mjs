import db from './db.js';
import fs from 'fs';

try {
  const sql = fs.readFileSync('migrations/collections_system.sql', 'utf8');
  await db.query(sql);
  console.log('Collections migration completed successfully');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}

process.exit(0);