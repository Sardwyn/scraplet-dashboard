import "../bootstrap/env.js";
import db from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    const sqlPath = path.join(__dirname, "../migrations/widget_library_system.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log("Running migration...");
    await db.query(sql);
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await db.end();
  }
}

run();
