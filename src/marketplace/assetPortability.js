// src/marketplace/assetPortability.js
// Scans an overlay config for user-uploaded assets, copies them to a
// content-addressed shared store, and rewrites the config paths.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../../db.js';

const UPLOADS_ROOT = process.env.SCRAPLET_UPLOADS_ROOT || '/var/www/scraplet-uploads';
const SHARED_DIR = path.join(UPLOADS_ROOT, 'shared');

function ensureSharedDir() {
  if (!fs.existsSync(SHARED_DIR)) fs.mkdirSync(SHARED_DIR, { recursive: true });
}

/**
 * Find all /uploads/u/{userId}/... paths in a config object (deep scan).
 */
export function findUserAssetPaths(obj, found = new Set()) {
  if (!obj || typeof obj !== 'object') return found;
  if (typeof obj === 'string') {
    if (/^\/uploads\/u\/\d+\//.test(obj)) found.add(obj);
    return found;
  }
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') {
      if (/^\/uploads\/u\/\d+\//.test(val)) found.add(val);
    } else if (val && typeof val === 'object') {
      findUserAssetPaths(val, found);
    }
  }
  return found;
}

/**
 * Hash a file's content (SHA256).
 */
function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Copy a user asset to the shared store if not already there.
 * Returns the new public path (/uploads/shared/{hash}.ext) or null if file missing.
 */
async function portAsset(urlPath, userId) {
  // Convert URL path to filesystem path
  const relPath = urlPath.replace(/^\/uploads/, '');
  const fsPath = path.join(UPLOADS_ROOT, relPath);

  if (!fs.existsSync(fsPath)) {
    console.warn('[assetPortability] file not found:', fsPath);
    return null;
  }

  const hash = hashFile(fsPath);
  const ext = path.extname(fsPath);
  const sharedFilename = hash + ext;
  const sharedFsPath = path.join(SHARED_DIR, sharedFilename);
  const sharedUrlPath = '/uploads/shared/' + sharedFilename;

  // Check if already in shared store
  const { rows } = await db.query(
    `SELECT id FROM shared_assets WHERE hash = $1`, [hash]
  );

  if (!rows.length) {
    // Copy file
    ensureSharedDir();
    fs.copyFileSync(fsPath, sharedFsPath);

    // Record in DB
    const stat = fs.statSync(sharedFsPath);
    const mime = guessMime(ext);
    await db.query(
      `INSERT INTO shared_assets (hash, original_user_id, file_path, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (hash) DO NOTHING`,
      [hash, userId, sharedUrlPath, mime, stat.size]
    );
  }

  return sharedUrlPath;
}

function guessMime(ext) {
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Deep-replace all occurrences of a string in an object.
 */
function deepReplace(obj, from, to) {
  if (typeof obj === 'string') return obj === from ? to : obj;
  if (Array.isArray(obj)) return obj.map(v => deepReplace(v, from, to));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepReplace(v, from, to);
    return out;
  }
  return obj;
}

/**
 * Main export: take an overlay config, port all user assets to shared store,
 * return the rewritten config + list of ported assets.
 *
 * @param {object} configJson - The overlay config_json
 * @param {number} userId - The owner's user ID
 * @returns {{ portedConfig: object, assetMap: Record<string,string>, missing: string[] }}
 */
export async function portOverlayAssets(configJson, userId) {
  const assetPaths = findUserAssetPaths(configJson);
  const assetMap = {};
  const missing = [];

  for (const urlPath of assetPaths) {
    const sharedPath = await portAsset(urlPath, userId);
    if (sharedPath) {
      assetMap[urlPath] = sharedPath;
    } else {
      missing.push(urlPath);
    }
  }

  // Rewrite config
  let portedConfig = configJson;
  for (const [from, to] of Object.entries(assetMap)) {
    portedConfig = deepReplace(portedConfig, from, to);
  }

  return { portedConfig, assetMap, missing };
}
