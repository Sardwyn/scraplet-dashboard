// /db.js
import pg from "pg";

let pool = null;

function redact(s = "") {
  return s.replace(/(:\/\/[^:]+:)([^@]+)@/, "$1***@");
}

function getConnString() {
  return process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL || "";
}

export function getPool() {
  if (!pool) {
    const cs = getConnString();
    if (!cs) {
      throw new Error("DATABASE_URL not set (checked DASHBOARD_DATABASE_URL, DATABASE_URL)");
    }
    console.log("🧠 DB config:", redact(cs));
    pool = new pg.Pool({
      connectionString: cs,
      ssl: false,
    });

    pool.on("error", (err) => {
      console.error("[dashboardDb] idle client error:", err);
    });
  }
  return pool;
}

/**
 * Back-compat: some modules expect db.connect() (Pool.connect()).
 * Returns a pg Client that you MUST release().
 */
export async function connect() {
  return getPool().connect();
}

export async function query(sql, params) {
  return getPool().query(sql, params);
}

/**
 * Optional: for graceful shutdowns.
 */
export async function end() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

export default { query, getPool, connect, end };
