import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, public_id, name, created_at FROM public.overlays ORDER BY created_at DESC;"
  );
  console.log("All Overlays:");
  console.log(res.rows);

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
