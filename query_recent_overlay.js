import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT * FROM public.overlays WHERE id = 16;"
  );
  if (res.rows.length === 0) {
    console.log("Overlay 16 not found!");
  } else {
    const row = res.rows[0];
    console.log("Overlay Details:", {
      id: row.id,
      name: row.name,
      slug: row.slug
    });
    console.log("\nConfig JSON Elements Overview:");
    const elements = row.config_json.elements || [];
    elements.forEach((el, i) => {
      console.log(`[${i}] ID: ${el.id} | Name: ${el.name || el.text || "Unnamed"} | Type: ${el.type} | Visible: ${el.visible} | ParentID: ${el.parentId || el.parent_id || "none"}`);
      if (el.parametricEffects && el.parametricEffects.length > 0) {
        console.log("    -> Parametric Effects:", JSON.stringify(el.parametricEffects, null, 2));
      }
    });
  }
  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
