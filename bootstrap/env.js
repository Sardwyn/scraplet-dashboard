// /var/www/scraplet/scraplet-dashboard/bootstrap/env.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project root is one level up from /bootstrap
const rootDir = path.resolve(__dirname, "..");

const envBasePath = path.join(rootDir, ".env");
const envLocalPath = path.join(rootDir, ".env.local");
const envOnlinePath = path.join(rootDir, ".env.online");

function loadEnvFile(label, filePath, { override }) {
  if (!fs.existsSync(filePath)) {
    console.log(`[env] ${label} missing (${path.basename(filePath)})`);
    return { loaded: false, injected: 0 };
  }
  const result = dotenv.config({ path: filePath, override });
  const injected = result?.parsed ? Object.keys(result.parsed).length : 0;
  console.log(
    `[env] ${label} loaded ${path.basename(filePath)} (injected ${injected})`
  );
  return { loaded: true, injected };
}

// 1) Always load .env first
loadEnvFile("base", envBasePath, { override: false });

// 2) Decide mode AFTER base env is loaded
const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
const appMode = (
  process.env.APP_MODE ||
  (nodeEnv === "production" ? "production" : "local")
).toLowerCase();

// 3) Optional profile envs
let loadedProfile = "base";

if (appMode === "online") {
  const r = loadEnvFile("profile", envOnlinePath, { override: true });
  if (r.loaded) loadedProfile = ".env.online";
} else if (nodeEnv !== "production") {
  const r = loadEnvFile("profile", envLocalPath, { override: true });
  if (r.loaded) loadedProfile = ".env.local";
} else {
  console.log("[env] production mode: skipping .env.local");
}

console.log(`🌍 APP_MODE: ${process.env.APP_MODE || appMode} (profile=${loadedProfile})`);

export const ENV_BOOTSTRAPPED = true;
