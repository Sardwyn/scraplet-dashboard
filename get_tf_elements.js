import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, public_id, config_json FROM public.overlays WHERE public_id = '04803bc8135f6b8ecd890d3d';"
  );

  if (res.rows.length === 0) {
    console.log("Overlay not found!");
  } else {
    const config = res.rows[0].config_json || {};
    const elements = config.elements || [];
    console.log(`Overlay: ${res.rows[0].name} (${res.rows[0].public_id})`);
    console.log("Elements:");
    console.log(JSON.stringify(elements, null, 2));
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
