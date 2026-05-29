import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/postgres" // Connect to default database
});

async function main() {
  await client.connect();
  console.log("Connected to postgres!");

  const res = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
  console.log("Databases:", res.rows.map(r => r.datname));

  await client.end();
}

main().catch(console.error);
