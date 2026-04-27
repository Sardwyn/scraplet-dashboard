require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('migrations/2026-04-21_marketplace_enhancements.sql', 'utf8');

pool.query(sql)
  .then(() => {
    console.log('✓ Migration complete');
    process.exit(0);
  })
  .catch(e => {
    console.error('✗ Migration failed:', e.message);
    process.exit(1);
  });
