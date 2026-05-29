const pg = require("pg");

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT id, public_id, name, config_json FROM public.overlays WHERE public_id = '04803bc8135f6b8ecd890d3d';"
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log(JSON.stringify(row.config_json, null, 2));
  }
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
