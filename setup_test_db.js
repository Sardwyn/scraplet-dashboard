import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  // Clean up any old entry with this guild ID just in case
  await client.query("DELETE FROM public.discord_guild_integrations WHERE guild_id = '1087720283286274059'");
  
  // Insert the correct test mapping
  await client.query(`
    INSERT INTO public.discord_guild_integrations (guild_id, owner_user_id, installed_by_user_id, status)
    VALUES ('1087720283286274059', '4', '4', 'active')
  `);
  console.log("Successfully created test integration mapping for guild '1087720283286274059' and owner '4'!");

  await client.end();
}

main().catch(err => {
  console.error("Error setting up DB:", err);
  process.exit(1);
});
