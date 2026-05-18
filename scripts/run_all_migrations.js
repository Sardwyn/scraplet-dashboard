import "../bootstrap/env.js";
import db from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    const migrationsDir = path.join(__dirname, "../migrations");
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files.`);

    for (const file of files) {
      console.log(`Applying migration: ${file}...`);
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, "utf8");
      try {
        await db.query(sql);
        console.log(`✅ Success: ${file}`);
      } catch (err) {
        console.warn(`⚠️ Warning/Error in ${file}:`, err.message);
      }
    }
    console.log("All migrations processed!");
  } catch (err) {
    console.error("Migration runner failed:", err);
  } finally {
    await db.end();
  }
}

run();
