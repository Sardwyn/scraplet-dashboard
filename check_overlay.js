import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays WHERE id IN (17, 18);"
  );

  res.rows.forEach(row => {
    console.log(`\nOverlay: [${row.id}] "${row.name}"`);
    const config = row.config_json || {};
    const elements = config.elements || [];

    console.log(`Total elements: ${elements.length}`);
    let matched = 0;
    elements.forEach((el, index) => {
      const hasImage = JSON.stringify(el).toLowerCase().includes('.png') || 
                       JSON.stringify(el).toLowerCase().includes('.jpg') ||
                       JSON.stringify(el).toLowerCase().includes('.jpeg');
                       
      if (hasImage || el.type === 'shape' || el.type === 'rect' || el.type === 'path') {
        matched++;
        if (matched <= 5 || hasImage) {
          console.log(`  - [${index}] Element: ID="${el.id}", Name="${el.name || el.id}", Type="${el.type}"`);
          if (el.pattern) console.log(`    - pattern: ${JSON.stringify(el.pattern)}`);
          if (el.fills) console.log(`    - fills: ${JSON.stringify(el.fills)}`);
        }
      }
    });
  });

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
});
