import pg from "pg";

async function checkDb(dbName) {
  const client = new pg.Client({
    connectionString: `postgres://scrapapp:Outrun1279!@127.0.0.1:5432/${dbName}`
  });
  try {
    await client.connect();
    console.log(`\n--- Checking DB: ${dbName} ---`);
    
    // Get all tables in the db
    const tablesRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Tables in ${dbName}:`, tables);
    
    if (tables.includes('overlays')) {
      const res = await client.query("SELECT id, name FROM public.overlays;");
      console.log(`Overlays in ${dbName}:`, res.rows);
      
      for (const row of res.rows) {
        if (row.name.toLowerCase().includes("tf") || row.name.toLowerCase().includes("start")) {
          console.log(`Found candidate overlay [${row.id}] "${row.name}" in database "${dbName}"`);
        }
      }
    }
  } catch (e) {
    console.error(`Error checking DB ${dbName}:`, e.message);
  } finally {
    await client.end();
  }
}

async function main() {
  await checkDb('scraplet_dashboard');
  await checkDb('scrapbot_clean');
}

main().catch(console.error);
