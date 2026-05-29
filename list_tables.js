import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );

  console.log("Tables in public schema:");
  console.log(res.rows.map(r => r.table_name));

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
});
