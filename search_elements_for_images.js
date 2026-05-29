import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays;"
  );
  
  console.log("Searching overlays for any elements that might represent images, or have keys like src/url/href/fills/media...");
  for (const row of res.rows) {
    const config = row.config_json || {};
    const elements = config.elements || [];
    let match = false;
    const matchingElements = [];
    
    for (const el of elements) {
      const elStr = JSON.stringify(el).toLowerCase();
      // Check for image types, URLs, source paths, or keys indicating media
      if (
        el.type === 'image' ||
        el.type === 'media' ||
        el.type === 'video' ||
        elStr.includes('http') ||
        elStr.includes('.png') ||
        elStr.includes('.jpg') ||
        elStr.includes('.jpeg') ||
        elStr.includes('/uploads/') ||
        elStr.includes('src') ||
        elStr.includes('image')
      ) {
        match = true;
        matchingElements.push(el);
      }
    }
    
    if (match) {
      console.log(`\nOverlay ID: ${row.id}, Name: "${row.name}" has ${matchingElements.length} match(es):`);
      matchingElements.forEach((el, idx) => {
        console.log(`  - [${idx + 1}] Type: "${el.type}", Name: "${el.name}", Keys:`, Object.keys(el));
        console.log(`    Content:`, JSON.stringify(el));
      });
    }
  }
  
  await client.end();
}

main().catch(console.error);
