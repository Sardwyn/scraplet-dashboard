import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, public_id, config_json FROM public.overlays ORDER BY id DESC;"
  );

  for (const row of res.rows) {
    const config = row.config_json || {};
    const elements = config.elements || [];
    elements.forEach((el, idx) => {
      if (el.src || el.url || el.image || el.bgImage || el.backgroundImage) {
        console.log(`\nOverlay [${row.id}] "${row.name}": Element [${idx}] ID=${el.id}, Name=${el.name}, Type=${el.type}:`);
        console.log(`  - src: ${el.src}`);
        console.log(`  - url: ${el.url}`);
        console.log(`  - image: ${el.image}`);
        console.log(`  - bgImage: ${el.bgImage}`);
        console.log(`  - backgroundImage: ${el.backgroundImage}`);
      }
    });
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
