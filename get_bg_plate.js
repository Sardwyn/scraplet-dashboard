import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays WHERE id = '20';"
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log(`Overlay [${row.id}] "${row.name}":`);
    const config = row.config_json || {};
    const elements = config.elements || [];
    const bgPlate = elements.find(el => el.name === "background_plate");
    if (bgPlate) {
      console.log("background_plate:", JSON.stringify(bgPlate, null, 2));
    } else {
      console.log("background_plate not found");
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
