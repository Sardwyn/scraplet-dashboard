// utils/icons.js
// Central icon detector for profile buttons

const platformMap = {
  'twitch.tv': 'twitch',
  'youtube.com': 'youtube',
  'paypal.me': 'paypal',
  'x.com': 'x',
  'buymeacoffee.com': 'buy-me-a-coffee',
  'cash.app': 'cashapp',
  'discord.gg': 'discord',
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'snapchat.com': 'snapchat',
  'tiktok.com': 'tiktok',
  'venmo.com': 'venmo',
  'onlyfans.com': 'onlyfans',
  'threads.net': 'threads',
  'tumblr.com': 'tumblr',
  'deviantart.com': 'deviantart',
  'gog.com': 'gogdotcom',
  'epicgames.com': 'epic-games'
};

/**
 * Given a URL, return the icon key (e.g. "twitch", "youtube") or null.
 */
export function detectIcon(url) {
  if (!url) return null;
  const lower = String(url).toLowerCase();
  const match = Object.entries(platformMap).find(([domain]) =>
    lower.includes(domain)
  );
  return match?.[1] || null;
}
