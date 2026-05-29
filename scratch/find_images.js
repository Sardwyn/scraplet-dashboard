import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const tables = ["overlays", "marketplace_overlays", "overlay_components"];
  for (const table of tables) {
    const res = await client.query(`SELECT * FROM public.${table};`);
    console.log(`Searching table ${table} (${res.rows.length} rows)...`);
    for (const row of res.rows) {
      const rStr = JSON.stringify(row).toLowerCase();
      if (rStr.includes("image") || rStr.includes(".png") || rStr.includes(".jpg") || rStr.includes(".jpeg")) {
        console.log(`  Match found in ${table} row [${row.id}] name="${row.name}":`);
        
        // Let's print any element that matched
        const config = row.config_json || row.components_json || row.elements_json || row;
        const elements = config.elements || config.components || (Array.isArray(config) ? config : []);
        
        const checkEl = (el) => {
          const elStr = JSON.stringify(el).toLowerCase();
          if (elStr.includes("image") || elStr.includes(".png") || elStr.includes(".jpg") || elStr.includes(".jpeg") || el.type === "image") {
            console.log(`    - Element: ID=${el.id}, Type=${el.type}, Name="${el.name || el.type}"`);
            console.log(`      Detail:`, JSON.stringify(el));
          }
          if (el.elements && Array.isArray(el.elements)) {
            el.elements.forEach(checkEl);
          }
        };
        
        if (Array.isArray(elements)) {
          elements.forEach(checkEl);
        } else if (typeof elements === "object") {
          Object.values(elements).forEach(checkEl);
        }
      }
    }
  }

  await client.end();
}

main().catch(console.error);
