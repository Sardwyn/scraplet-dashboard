export function generateDataTrack(label, url, type = 'Button') {
  if (label && label.trim()) return `${type}: ${label.trim()}`;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return `${type}: Visit ${domain}`;
  } catch {
    return `${type}: Unknown`;
  }
}
