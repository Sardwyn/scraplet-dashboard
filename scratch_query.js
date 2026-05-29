import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    `SELECT id, name, config_json FROM overlays;`
  );

  for (const row of res.rows) {
    const config = row.config_json;
    if (config && config.elements) {
      console.log(`\nOverlay [${row.id}] "${row.name}" has ${config.elements.length} elements:`);
      config.elements.forEach((el, index) => {
        console.log(`  [${index}] type: "${el.type}", name: "${el.name || 'Unnamed'}" (${el.id})`);
        if (el.src || el.url) {
          console.log(`      src/url: ${el.src || el.url}`);
        }
      });
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
