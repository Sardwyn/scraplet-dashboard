import db from "../db.js";

async function run() {
  try {
    const { rows } = await db.query(
      "SELECT id, name, config_json FROM public.overlays WHERE id = 34"
    );
    if (rows.length === 0) {
      console.log("No overlay 34 found!");
    } else {
      console.log("Overlay 34 details:");
      console.log(JSON.stringify(rows[0], null, 2));
    }
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await db.end();
  }
}

run();
