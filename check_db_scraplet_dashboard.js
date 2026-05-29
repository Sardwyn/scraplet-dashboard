import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/scraplet_dashboard"
});

async function main() {
  await client.connect();
  console.log("Connected to scraplet_dashboard database!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays WHERE id = '4';"
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log(`Overlay ID: ${row.id}, Name: "${row.name}"`);
    console.log(`Config:`, JSON.stringify(row.config_json, null, 2));
  } else {
    console.log("Overlay with ID 4 not found.");
  }

  await client.end();
}

main().catch(console.error);
