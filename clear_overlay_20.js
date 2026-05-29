import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const cleanJson = {
    elements: [],
    timeline: { durationMs: 5000, tracks: [] },
    settings: { width: 1920, height: 1080 }
  };

  const res = await client.query(
    "UPDATE public.overlays SET config_json = $1, updated_at = NOW() WHERE id = 20 RETURNING id, name, slug",
    [cleanJson]
  );

  console.log("Successfully cleared Overlay ID 20:", res.rows[0]);
  await client.end();
}

main().catch(err => {
  console.error("Error clearing overlay 20:", err);
  process.exit(1);
});
