import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays ORDER BY created_at DESC;"
  );

  for (const row of res.rows) {
    const config = row.config_json || {};
    const elements = config.elements || [];
    const types = {};
    elements.forEach(el => {
      types[el.type] = (types[el.type] || 0) + 1;
    });
    console.log(`Overlay [${row.id}] "${row.name}" has types:`, types);
    if (elements.some(el => el.type === 'componentInstance')) {
      const instances = elements.filter(el => el.type === 'componentInstance');
      console.log(`  - Instances:`, instances.map(i => `${i.id}: componentId=${i.componentId}`));
    }
    // Let's search inside components if defined in config_json
    const components = config.components || [];
    if (components.length > 0) {
      console.log(`  - Config components:`, components.map(c => `${c.id} (${c.name})`));
      components.forEach(comp => {
        const compEls = comp.elements || [];
        const compTypes = {};
        compEls.forEach(el => { compTypes[el.type] = (compTypes[el.type] || 0) + 1; });
        console.log(`    Component "${comp.name}" types:`, compTypes);
      });
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
