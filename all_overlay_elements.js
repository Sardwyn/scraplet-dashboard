import pg from "pg";
import fs from "fs";

const client = new pg.Client({
  connectionString: "postgres://scrapapp:Outrun1279!@127.0.0.1:5432/creator_platform"
});

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT id, public_id, name, config_json FROM public.overlays ORDER BY id;"
  );
  
  let output = "";
  for (const row of res.rows) {
    output += `\n=========================================\n`;
    output += `OVERLAY ID: ${row.id} | PUBLIC_ID: ${row.public_id} | NAME: "${row.name}"\n`;
    output += `=========================================\n`;
    const config = row.config_json || {};
    const elements = config.elements || [];
    output += `Total elements: ${elements.length}\n`;
    elements.forEach((el, idx) => {
      output += `  Element #${idx + 1}: [Type: ${el.type}] Name: "${el.name}"\n`;
      output += `    JSON: ${JSON.stringify(el, null, 2).replace(/\n/g, '\n    ')}\n`;
    });
  }
  
  fs.writeFileSync("all_overlay_elements.txt", output);
  console.log("Wrote all overlay elements to all_overlay_elements.txt");
  await client.end();
}

main().catch(console.error);
