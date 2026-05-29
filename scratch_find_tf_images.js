import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  // Let's get all overlays and parse their config_json/elements
  const res = await client.query(
    "SELECT id, public_id, name, config_json, created_at FROM public.overlays ORDER BY created_at DESC;"
  );

  console.log(`Found ${res.rows.length} overlays.`);
  for (const row of res.rows) {
    const config = row.config_json || {};
    const elements = config.elements || [];
    const images = elements.filter(el => el.type === 'image');
    if (images.length > 0) {
      console.log(`\nOverlay [${row.id}] "${row.name}" has ${images.length} images:`);
      images.forEach(img => {
        console.log(`  - Image ID: ${img.id}, Name: "${img.name}", Src: "${img.src}", x: ${img.x}, y: ${img.y}, zIndex: ${img.zIndex || 'N/A'}`);
      });
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
