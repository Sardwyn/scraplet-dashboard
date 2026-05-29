import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

function searchObj(obj, path = "") {
  const results = [];
  if (!obj || typeof obj !== "object") return results;

  for (const [key, val] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (typeof val === "string") {
      const lower = val.toLowerCase();
      if (
        lower.includes(".png") ||
        lower.includes(".jpg") ||
        lower.includes(".jpeg") ||
        lower.includes(".gif") ||
        lower.includes(".webp") ||
        lower.includes("data:image/") ||
        lower.includes("/uploads/") ||
        lower.includes("/images/") ||
        lower.includes("http://") ||
        lower.includes("https://")
      ) {
        results.push({ path: currentPath, value: val });
      }
    } else if (typeof val === "object") {
      results.push(...searchObj(val, currentPath));
    }
  }
  return results;
}

async function main() {
  await client.connect();
  console.log("Database connected!");

  const res = await client.query(
    "SELECT id, name, config_json, created_at FROM public.overlays ORDER BY created_at DESC;"
  );

  console.log(`Searching across ${res.rows.length} overlays...`);
  for (const row of res.rows) {
    const matches = searchObj(row.config_json);
    if (matches.length > 0) {
      console.log(`\nOverlay [${row.id}] "${row.name}" has ${matches.length} matching asset/url fields:`);
      matches.forEach(m => {
        console.log(`  - ${m.path}: "${m.value.substring(0, 150)}${m.value.length > 150 ? '...' : ''}"`);
      });
    }
  }

  await client.end();
}

main().catch(err => {
  console.error("Error in query:", err);
  process.exit(1);
});
