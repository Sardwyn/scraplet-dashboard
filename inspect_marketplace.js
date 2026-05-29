import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.marketplace_overlays WHERE id IN (4, 5);"
  );

  res.rows.forEach(row => {
    console.log(`\n========================================`);
    console.log(`Marketplace Overlay [${row.id}] "${row.name}"`);
    console.log(`========================================`);
    const config = row.config_json || {};
    const elements = config.elements || [];
    
    elements.forEach((el, index) => {
      const elStr = JSON.stringify(el).toLowerCase();
      if (index === 0 || elStr.includes('.png') || elStr.includes('.jpg') || elStr.includes('.jpeg')) {
        console.log(`\n[${index}] Element: ID="${el.id}", Name="${el.name || el.id}", Type="${el.type}"`);
        console.log(JSON.stringify(el, null, 2));
      }
    });
  });

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
});
