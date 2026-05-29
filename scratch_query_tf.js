import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT id, name, slug, config_json FROM public.overlays"
  );
  
  for (const row of res.rows) {
    const configStr = JSON.stringify(row.config_json);
    if (configStr.includes(".png") || configStr.includes(".jpg") || configStr.includes(".jpeg") || configStr.includes("http")) {
      console.log(`Match found - Overlay ID: ${row.id}, Name: "${row.name}", Slug: "${row.slug}"`);
      const config = row.config_json || {};
      const elements = config.elements || [];
      elements.forEach((el, index) => {
        if (JSON.stringify(el).includes(".png") || JSON.stringify(el).includes(".jpg") || JSON.stringify(el).includes(".jpeg") || JSON.stringify(el).includes("http")) {
          console.log(`  - [${el.type}] name="${el.name}" id="${el.id}" src/fill="${el.src || el.fillColor || JSON.stringify(el.fills || '')}"`);
        }
      });
    }
  }
  
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
