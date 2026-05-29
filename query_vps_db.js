import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  console.log("\n--- Active Guild Integrations ---");
  const integrations = await client.query(
    "SELECT guild_id, owner_user_id, status, created_at FROM public.discord_guild_integrations WHERE status = 'active';"
  );
  console.log(integrations.rows);

  console.log("\n--- Overlays for Active Users ---");
  const overlays = await client.query(
    "SELECT id, user_id, public_id, name, slug, created_at FROM public.overlays ORDER BY created_at DESC LIMIT 15;"
  );
  console.log(overlays.rows);

  console.log("\n--- Recent Discord AI Messages ---");
  const messages = await client.query(
    "SELECT id, conversation_id, role, LEFT(content, 120) as snippet, author_name, created_at FROM public.discord_ai_messages ORDER BY created_at DESC LIMIT 15;"
  );
  console.log(messages.rows);

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
