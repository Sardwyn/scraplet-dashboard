import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  console.log("\n=== DISCORD GUILD INTEGRATIONS ===");
  const integrations = await client.query("SELECT * FROM public.discord_guild_integrations");
  console.log(integrations.rows);

  console.log("\n=== ALL OVERLAYS ===");
  const overlays = await client.query("SELECT id, user_id, public_id, name, slug FROM public.overlays");
  console.log(overlays.rows);

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
