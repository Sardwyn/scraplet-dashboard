import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  // 1. Search public.overlays for config_json containing any "TF" or image types
  const res1 = await client.query(
    "SELECT id, public_id, name, config_json FROM public.overlays;"
  );
  console.log(`\n--- Searching ${res1.rows.length} User Overlays ---`);
  for (const row of res1.rows) {
    const configStr = JSON.stringify(row.config_json || {});
    if (configStr.toLowerCase().includes("tf") || row.name.toLowerCase().includes("tf")) {
      console.log(`Match in overlays: ID: ${row.id}, Name: "${row.name}"`);
      const elements = row.config_json?.elements || [];
      elements.forEach(el => {
        if (el.type === 'image' || JSON.stringify(el).toLowerCase().includes("tf")) {
          console.log(`  Element:`, el);
        }
      });
    }
  }

  // 2. Search public.marketplace_overlays
  try {
    const res2 = await client.query(
      "SELECT id, title, overlay_id FROM public.marketplace_overlays;"
    );
    console.log(`\n--- Searching ${res2.rows.length} Marketplace Overlays ---`);
    for (const row of res2.rows) {
      console.log(`Marketplace Item: ID: ${row.id}, Title: "${row.title}", OverlayID: ${row.overlay_id}`);
      if (row.title.toLowerCase().includes("tf") || row.title.toLowerCase().includes("start")) {
        console.log(`Found candidate marketplace overlay: ${row.title}`);
        if (row.overlay_id) {
          const overlayRes = await client.query(
            "SELECT id, name, config_json FROM public.overlays WHERE id = $1;",
            [row.overlay_id]
          );
          if (overlayRes.rows.length > 0) {
            const overlay = overlayRes.rows[0];
            console.log(`  Associated overlay config:`, JSON.stringify(overlay.config_json));
          }
        }
      }
    }
  } catch (e) {
    console.log("Failed to query marketplace_overlays:", e.message);
  }

  // 3. Search public.widget_configs or similar tables
  try {
    const res3 = await client.query(
      "SELECT id, name, config_json FROM public.widget_configs;"
    );
    console.log(`\n--- Searching ${res3.rows.length} Widget Configs ---`);
    for (const row of res3.rows) {
      const configStr = JSON.stringify(row.config_json || {});
      if (configStr.toLowerCase().includes("tf") || row.name.toLowerCase().includes("tf")) {
        console.log(`Match in widget_configs: ID: ${row.id}, Name: "${row.name}"`);
      }
    }
  } catch (e) {
    console.log("No widget_configs table or failed to query:", e.message);
  }

  await client.end();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
