import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT config_json FROM public.overlays WHERE public_id = '04803bc8135f6b8ecd890d3d'"
  );
  
  if (res.rows.length === 0) {
    console.log("No overlay found with public_id 04803bc8135f6b8ecd890d3d");
    await client.end();
    return;
  }
  
  const config = res.rows[0].config_json || {};
  console.log("Overlay Config:", JSON.stringify({
    name: config.name,
    backgroundColor: config.backgroundColor,
    baseResolution: config.baseResolution
  }, null, 2));
  
  const elements = config.elements || [];
  console.log("\nElements in Overlay:");
  console.log(JSON.stringify(elements, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
