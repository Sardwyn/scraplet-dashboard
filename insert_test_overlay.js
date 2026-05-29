import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  // Delete existing test overlay if any
  await client.query("DELETE FROM public.overlays WHERE slug = 'test-raven-start';");

  // Get config from marketplace overlay 4
  const mRes = await client.query(
    "SELECT title, snapshot_config FROM public.marketplace_overlays WHERE id = 4;"
  );

  if (mRes.rows.length === 0) {
    console.error("Marketplace overlay 4 not found");
    await client.end();
    return;
  }

  const { title, snapshot_config } = mRes.rows[0];

  // Insert into public.overlays
  const insertRes = await client.query(
    "INSERT INTO public.overlays (name, slug, config_json, created_at, updated_at) VALUES ($1, $2, $3, NOW(), $4) RETURNING id, slug;",
    [`Test ${title}`, 'test-raven-start', snapshot_config, new Date()]
  );

  console.log("Successfully cloned and inserted test overlay!");
  console.log(insertRes.rows[0]);

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
});
