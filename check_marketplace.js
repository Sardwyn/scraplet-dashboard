import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.marketplace_overlays;"
  );

  console.log(`Total marketplace overlays: ${res.rows.length}`);
  res.rows.forEach(row => {
    const config = row.config_json || {};
    const elements = config.elements || [];
    let imageElements = [];

    elements.forEach((el, index) => {
      const elStr = JSON.stringify(el).toLowerCase();
      if (
        elStr.includes('.png') ||
        elStr.includes('.jpg') ||
        elStr.includes('.jpeg') ||
        elStr.includes('.webp') ||
        elStr.includes('.gif')
      ) {
        imageElements.push({ index, id: el.id, name: el.name || el.id, type: el.type });
      }
    });

    if (imageElements.length > 0) {
      console.log(`\nMarketplace Overlay [${row.id}] "${row.name}" has ${imageElements.length} image elements:`);
      imageElements.forEach(ie => {
        console.log(`  - [${ie.index}] ${ie.name} (Type="${ie.type}")`);
      });
    }
  });

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
});
