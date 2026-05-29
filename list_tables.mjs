import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = '/home/sardwyn/repos/scraplet-dashboard/.env';
let connectionString = process.env.DATABASE_URL;

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  if (match) {
    connectionString = match[1].trim().replace(/^['"]|['"]$/g, '');
  }
} catch (err) {
  console.error("Failed to read .env:", err.message);
}

if (!connectionString) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: false });
await client.connect();

const { rows: tables } = await client.query(`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public'
`);

console.log("TABLES IN DATABASE:");
console.log(tables.map(t => t.table_name));

const { rows: columns } = await client.query(`
  SELECT table_name, column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name IN ('stream_sessions', 'overlays', 'discord_guild_integrations')
`);

console.log("\nCOLUMNS INFO:");
console.log(columns);

await client.end();
