import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, public_id, name, config_json FROM public.overlays WHERE public_id = $1;",
    ["04803bc8135f6b8ecd890d3d"]
  );

  if (res.rows.length === 0) {
    console.log("Overlay not found!");
    await client.end();
    return;
  }

  const row = res.rows[0];
  console.log(`Overlay: [${row.id}] "${row.name}"`);
  const elements = row.config_json?.elements || [];
  elements.forEach((el, index) => {
    console.log(`\n[${index}] Element:`);
    console.log(`  ID: ${el.id}`);
    console.log(`  Name: "${el.name}"`);
    console.log(`  Type: "${el.type}"`);
    console.log(`  Visible: ${el.visible}`);
    console.log(`  x: ${el.x}, y: ${el.y}, w: ${el.width}, h: ${el.height}`);
    if (el.type === 'text') {
      console.log(`  Text: "${el.text}"`);
      console.log(`  Color: "${el.color}"`);
      console.log(`  FontFamily: "${el.fontFamily}"`);
      console.log(`  FontSize: ${el.fontSizePx || el.fontSize}`);
    }
    if (el.type === 'image') {
      console.log(`  Src: "${el.src}"`);
    }
    if (el.parametricEffects) {
      console.log(`  ParametricEffects:`, JSON.stringify(el.parametricEffects, null, 2));
    }
    if (el.childIds) {
      console.log(`  Child IDs:`, el.childIds);
    }
  });

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
