import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, slug FROM public.overlays;"
  );

  console.log(`Total overlays: ${res.rows.length}`);
  console.log(res.rows);

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
});
