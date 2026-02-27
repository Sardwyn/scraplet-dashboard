import fs from 'fs';
import path from 'path';
import db from '../db.js';

const domainMap = {
  'twitch': 'twitch.tv',
  'youtube': 'youtube.com',
  'paypal': 'paypal.me',
  'x': 'x.com',
  'buy-me-a-coffee': 'buymeacoffee.com',
  'cashapp': 'cash.app',
  'discord': 'discord.gg',
  'instagram': 'instagram.com',
  'facebook': 'facebook.com',
  'snapchat': 'snapchat.com',
  'tiktok': 'tiktok.com',
  'venmo': 'venmo.com',
  'onlyfans': 'onlyfans.com',
  'threads': 'threads.net',
  'tumblr': 'tumblr.com',
  'deviantart': 'deviantart.com',
  'gogdotcom': 'gog.com',
  'epic-games': 'epicgames.com'
};

async function populateIcons() {
  const icons = fs.readdirSync('/usr/share/nginx/icons/').filter(f => f.endsWith('.svg'));

  for (const file of icons) {
    const icon = path.basename(file, '.svg');
    const name = icon.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const domain = domainMap[icon] || null;

    if (!domain) continue;

    try {
      await db.query(
        'INSERT INTO platform_icons (name, icon, domain) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [name, icon, domain]
      );
      console.log(`✅ Inserted: ${name} (${icon}) → ${domain}`);
    } catch (err) {
      console.error(`❌ Failed to insert ${icon}:`, err.message);
    }
  }
}

populateIcons();
