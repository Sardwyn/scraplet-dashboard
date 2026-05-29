import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays WHERE id = '19';"
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log(`Overlay [${row.id}] "${row.name}":`);
    const config = row.config_json || {};
    const elements = config.elements || [];
    elements.forEach(el => {
      console.log(`- Element: ID=${el.id}, Type=${el.type}, Name="${el.name}", x=${el.x}, y=${el.y}, w=${el.width}, h=${el.height}`);
      if (el.fillColor) console.log(`  fillColor: ${el.fillColor}`);
      if (el.fills) console.log(`  fills:`, JSON.stringify(el.fills));
      if (el.backgroundImage) console.log(`  backgroundImage: ${el.backgroundImage}`);
      if (el.src) console.log(`  src: ${el.src}`);
    });
  } else {
    console.log("Overlay 19 not found");
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
