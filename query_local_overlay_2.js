import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays WHERE id = 2;"
  );
  if (res.rows.length === 0) {
    console.log("Overlay 2 not found!");
  } else {
    console.log("Overlay name:", res.rows[0].name);
    const elements = res.rows[0].config_json.elements;
    const booleanEl = elements.find(el => el.type === "boolean");
    if (booleanEl) {
      const childIds = booleanEl.childIds || [];
      const children = elements.filter(el => childIds.includes(el.id));
      console.log("Boolean Element:", JSON.stringify(booleanEl, null, 2));
      console.log("Children of Boolean Element:", JSON.stringify(children, null, 2));
    } else {
      console.log("No boolean element found in Overlay 2 elements.");
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});

