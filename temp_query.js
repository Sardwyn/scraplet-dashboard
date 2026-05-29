import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json FROM public.overlays ORDER BY created_at DESC;"
  );

  console.log(`Searching ${res.rows.length} overlays for nested group, frame, or image elements...`);
  for (const row of res.rows) {
    const config = row.config_json || {};
    const elements = config.elements || [];
    const groups = elements.filter(el => el.type === 'group' || el.type === 'frame');
    const images = elements.filter(el => el.type === 'image' || el.type === 'video');

    if (groups.length > 0 || images.length > 0) {
      console.log(`\nOverlay [${row.id}] "${row.name}":`);
      if (groups.length > 0) {
        console.log(`  - Groups/Frames (${groups.length}):`);
        groups.forEach(g => {
          console.log(`    * [${g.type}] ID: ${g.id}, Name: "${g.name}", ChildIds: ${JSON.stringify(g.childIds)}`);
        });
      }
      if (images.length > 0) {
        console.log(`  - Images/Videos (${images.length}):`);
        images.forEach(img => {
          // Check if this image has a parent
          const parent = elements.find(el => el.childIds && el.childIds.includes(img.id));
          console.log(`    * [${img.type}] ID: ${img.id}, Name: "${img.name}", Src: "${img.src}", Parent: ${parent ? `[${parent.type}] "${parent.name}" (${parent.id})` : 'None (Root)'}`);
        });
      }
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
