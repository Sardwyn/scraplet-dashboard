import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT config_json FROM public.overlays WHERE id = 2;"
  );
  const elements = res.rows[0].config_json.elements;
  console.log("Overlay Elements Summary:");
  elements.forEach((el, index) => {
    console.log(`${index}: [${el.type}] name="${el.name}" id="${el.id}" x=${el.x} y=${el.y} w=${el.width} h=${el.height} visible=${el.visible} childIds=${JSON.stringify(el.childIds || [])}`);
  });
  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
