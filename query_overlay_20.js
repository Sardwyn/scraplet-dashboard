import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT * FROM public.overlays WHERE id = 20;"
  );
  if (res.rows.length === 0) {
    console.log("Overlay 20 not found!");
  } else {
    const row = res.rows[0];
    console.log("Overlay Details:", {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      slug: row.slug,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
    console.log("\nConfig JSON Elements Overview:");
    const elements = row.config_json.elements || [];
    console.table(elements.map((el, i) => ({
      index: i,
      id: el.id,
      name: el.name || el.text || "Unnamed",
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      visible: el.visible,
      childIds: el.childIds ? el.childIds.join(", ") : ""
    })));
  }
  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
