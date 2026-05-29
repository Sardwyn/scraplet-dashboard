import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, public_id, created_at FROM public.overlays WHERE name ILIKE '%TF%' OR name ILIKE '%Start%Screen%';"
  );

  console.log("Matching overlays:", res.rows);

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
