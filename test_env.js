import "dotenv/config";
import db from "./db.js";

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log("DASHBOARD_DATABASE_URL:", process.env.DASHBOARD_DATABASE_URL);
  console.log("GEMINI_API_KEY is set:", !!process.env.GEMINI_API_KEY);

  try {
    const { rows } = await db.query("SELECT id, user_id, public_id, name, slug FROM public.overlays ORDER BY updated_at DESC");
    console.log("\n=== ALL OVERLAYS ===");
    console.log(rows);
  } catch (err) {
    console.error("Database query failed:", err.message);
  } finally {
    await db.end();
  }
}
main();
