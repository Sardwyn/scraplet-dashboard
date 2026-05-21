import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import parseSvgPath from 'parse-svg-path';
import absSvgPath from 'abs-svg-path';
import normalizeSvgPath from 'normalize-svg-path';

const ICONIFY_API_BASE = 'https://api.iconify.design';

/**
 * Searches the Iconify API for icons matching the query.
 * @param {string} query - The search term
 * @param {number} limit - Max results to return
 * @returns {Promise<string[]>} Array of icon IDs (e.g. 'mdi:controller')
 */
export async function searchIcons(query, limit = 5) {
  try {
    const res = await fetch(`${ICONIFY_API_BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error(`Iconify search failed: ${res.status}`);
    const data = await res.json();
    return data.icons || [];
  } catch (err) {
    console.error('[vectorLibrary] searchIcons error:', err.message);
    return [];
  }
}

/**
 * Fetches the SVG for a given Iconify icon ID and parses its paths into OverlayPath commands.
 * @param {string} iconId - The icon ID (e.g., 'lucide:gamepad-2')
 * @returns {Promise<Array<{commands: any[]}>>} Array of parsed paths
 */
export async function getIconSvgAsPaths(iconId) {
  try {
    const res = await fetch(`${ICONIFY_API_BASE}/${iconId}.svg`);
    if (!res.ok) throw new Error(`Iconify fetch failed: ${res.status}`);
    const svgStr = await res.text();

    const $ = cheerio.load(svgStr, { xmlMode: true });
    const paths = $('path');
    const overlayPaths = [];

    paths.each((i, el) => {
      const d = $(el).attr('d');
      if (!d) return;

      const parsed = parseSvgPath(d);
      const absolute = absSvgPath(parsed);
      const normalized = normalizeSvgPath(absolute);

      const commands = [];
      for (const seg of normalized) {
        const type = seg[0];
        if (type === 'M') commands.push({ type: 'move', x: seg[1], y: seg[2] });
        else if (type === 'L') commands.push({ type: 'line', x: seg[1], y: seg[2] });
        else if (type === 'C') commands.push({ type: 'curve', x1: seg[1], y1: seg[2], x2: seg[3], y2: seg[4], x: seg[5], y: seg[6] });
        else if (type === 'Z') commands.push({ type: 'close' });
      }

      if (commands.length > 0) {
        overlayPaths.push({ commands });
      }
    });

    // Determine viewBox to scale it to a standard size later
    let viewBox = $('svg').attr('viewBox');
    let width = 24, height = 24;
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        width = parts[2] - parts[0];
        height = parts[3] - parts[1];
      }
    } else {
      width = parseInt($('svg').attr('width') || '24', 10);
      height = parseInt($('svg').attr('height') || '24', 10);
    }

    return {
      paths: overlayPaths,
      viewBox: { width, height }
    };
  } catch (err) {
    console.error('[vectorLibrary] getIconSvgAsPaths error:', err.message);
    throw err;
  }
}

export default { searchIcons, getIconSvgAsPaths };
