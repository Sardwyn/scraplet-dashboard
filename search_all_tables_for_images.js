import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  // List all tables in creator_platform
  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
  );
  const tables = tablesRes.rows.map(r => r.table_name);

  console.log("Searching all tables in creator_platform database for any row containing image-like fields...");
  
  for (const table of tables) {
    try {
      // Find character columns
      const colsRes = await client.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public';",
        [table]
      );
      
      const textCols = colsRes.rows
        .filter(r => ['character varying', 'text', 'jsonb', 'json'].includes(r.data_type))
        .map(r => r.column_name);
        
      if (textCols.length === 0) continue;
      
      // Construct a query to search for keywords in these columns
      const searchTerms = ['image', '.png', '.jpg', 'tf', 'start screen'];
      const conditions = [];
      const queryParams = [];
      let paramIdx = 1;
      
      for (const col of textCols) {
        for (const term of searchTerms) {
          conditions.push(`CAST(${col} AS TEXT) ILIKE $${paramIdx}`);
          queryParams.push(`%${term}%`);
          paramIdx++;
        }
      }
      
      if (conditions.length === 0) continue;
      
      // Let's run a SELECT query with these conditions combined with OR
      const queryStr = `SELECT * FROM public.${table} WHERE ${conditions.join(' OR ')} LIMIT 10;`;
      const res = await client.query({ text: queryStr, values: queryParams });
      
      if (res.rows.length > 0) {
        console.log(`\nTable "${table}" has ${res.rows.length} matching row(s):`);
        res.rows.forEach((row, i) => {
          console.log(`  Row ${i + 1}:`);
          for (const [k, v] of Object.entries(row)) {
            const vStr = String(v);
            if (searchTerms.some(t => vStr.toLowerCase().includes(t))) {
              console.log(`    ${k}: ${vStr.substring(0, 300)}`);
            }
          }
        });
      }
    } catch (e) {
      // Ignore errors for system columns or special conditions
    }
  }

  await client.end();
}

main().catch(console.error);
