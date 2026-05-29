import pg from 'pg';
import fetch from 'node-fetch';

const { Client } = pg;

const client = new Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  const overlayId = "04803bc8135f6b8ecd890d3d";
  console.log(`Fetching config for overlay ${overlayId}...`);
  
  const res = await fetch(`https://scraplet.store/api/overlays/public/${overlayId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch overlay: ${res.statusText}`);
  }
  
  const config = await res.json();
  console.log("Successfully fetched config!");

  await client.connect();
  console.log("Database connected!");

  // Clean up any existing records
  await client.query("DELETE FROM public.overlays WHERE public_id = $1 OR slug = $1;", [overlayId]);

  // Insert the overlay into public.overlays under Sardwyn's account (user_id = 4)
  const insertRes = await client.query(
    `INSERT INTO public.overlays (user_id, name, slug, public_id, config_json, created_at, updated_at) 
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, slug, public_id;`,
    [4, "TF Start Screen", overlayId, overlayId, config]
  );

  console.log("Successfully imported and inserted overlay locally!");
  console.log(insertRes.rows[0]);

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
