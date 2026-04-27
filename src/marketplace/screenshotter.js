// src/marketplace/screenshotter.js
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const THUMB_DIR = '/var/www/scraplet/scraplet-dashboard/public/static/marketplace/thumbs';
const BASE_URL = 'https://scraplet.store';

export async function screenshotListing(listingId, overlayPublicId) {
  try {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(BASE_URL + '/o/' + overlayPublicId, { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const outPath = path.join(THUMB_DIR, listingId + '.jpg');
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 85 });
    await browser.close();
    console.log('[screenshotter] saved', outPath);
    return '/static/marketplace/thumbs/' + listingId + '.jpg';
  } catch (err) {
    console.error('[screenshotter] failed for listing', listingId, err.message);
    return null;
  }
}
