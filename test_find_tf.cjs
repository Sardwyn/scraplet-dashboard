const pg = require("pg");

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, public_id, name, config_json FROM public.overlays WHERE public_id = '04803bc8135f6b8ecd890d3d';"
  );

  if (res.rows.length === 0) {
    console.log("Overlay not found!");
  } else {
    const row = res.rows[0];
    console.log(`Overlay: ${row.name} (${row.public_id})`);
    const elements = row.config_json?.elements || [];
    console.log(`Found ${elements.length} elements:`);
    elements.forEach((el, index) => {
      console.log(`[${index}] ID: ${el.id}, Type: ${el.type}, Name: ${el.name}, Visible: ${el.visible}, x: ${el.x}, y: ${el.y}, w: ${el.width}, h: ${el.height}`);
      if (el.type === 'image' || el.src) {
        console.log(`    -> Src: ${el.src}`);
      }
      if (el.type === 'text') {
        console.log(`    -> Text: "${el.text}", Font: ${el.fontFamily}`);
      }
      if (el.fills || el.backgroundColor || el.pattern) {
        console.log(`    -> Fills:`, JSON.stringify(el.fills || el.pattern || el.backgroundColor));
      }
    });
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
