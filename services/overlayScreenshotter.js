// services/overlayScreenshotter.js
// Fire-and-forget thumbnail generation for overlay cards.
// Called after a successful overlay save — does not block the response.

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import db from '../db.js';

const THUMB_DIR = '/var/www/scraplet-uploads/overlay-thumbs';
const BASE_URL = process.env.SITE_BASE_URL || 'https://scraplet.store';

// Static asset types — small canvases that need centering in the thumbnail
const STATIC_ASSET_TYPES = new Set([
  'kick_panel', 'twitch_panel', 'kick_offline', 'twitch_offline',
  'yt_channel_art', 'yt_thumbnail',
]);

// Thumbnail output size — all thumbnails are saved at this resolution
const THUMB_W = 1280;
const THUMB_H = 720;

export async function generateOverlayThumbnail(overlayId, publicId) {
  try {
    fs.mkdirSync(THUMB_DIR, { recursive: true });

    // Fetch overlay metadata to get baseResolution and asset_type
    const { rows } = await db.query(
      `SELECT config_json, asset_type FROM overlays WHERE id = $1`,
      [overlayId]
    );
    if (!rows.length) return;

    const config = rows[0].config_json || {};
    const assetType = rows[0].asset_type || 'overlay';
    const canvasW = config.baseResolution?.width  || 1920;
    const canvasH = config.baseResolution?.height || 1080;
    const isStatic = STATIC_ASSET_TYPES.has(assetType);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();

    if (isStatic) {
      // For static assets: set viewport to the canvas native size so we
      // capture exactly the canvas, then we'll scale it to thumbnail size
      await page.setViewport({ width: canvasW, height: canvasH });
    } else {
      // For OBS overlays: set viewport to match the canvas exactly
      // so we always capture the full canvas area
      await page.setViewport({ width: canvasW, height: canvasH });
    }

    const url = `${BASE_URL}/o/${publicId}`;

    // domcontentloaded — networkidle2 never fires due to persistent SSE stream
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for React to render and widgets to initialise
    await new Promise(r => setTimeout(r, 2500));

    const filename = `${publicId}.jpg`;
    const outPath = path.join(THUMB_DIR, filename);

    if (isStatic) {
      // Screenshot the canvas element at native size, then let the browser
      // scale it — we screenshot the full viewport which IS the canvas
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 85 });
    } else {
      // OBS overlay: viewport = canvas size, screenshot = full canvas
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 80 });
    }

    await browser.close();

    const thumbnailUrl = `/uploads/overlay-thumbs/${filename}`;

    await db.query(
      `UPDATE overlays SET thumbnail_url = $1 WHERE id = $2`,
      [thumbnailUrl, overlayId]
    );

  } catch (err) {
    console.error('[overlayScreenshotter] failed for overlay', overlayId, err.message);
  }
}
