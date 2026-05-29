import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, role, content, author_name, created_at FROM public.discord_ai_messages WHERE content ILIKE '%TF%' OR content ILIKE '%Start Screen%' OR content ILIKE '%image%' ORDER BY created_at DESC LIMIT 50;"
  );

  console.log(`Found ${res.rows.length} matching messages:`);
  res.rows.forEach(row => {
    console.log(`\n[${row.created_at.toISOString()}] Role: ${row.role}, Author: ${row.author_name}`);
    console.log(`Content: ${row.content}`);
  });

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
