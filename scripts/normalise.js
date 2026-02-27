export function normaliseHandle(platform, value) {
  if (!value) return null;

  let v = value.trim();

  // Strip protocol
  v = v.replace(/^https?:\/\/(www\.)?/, '');

  switch (platform) {
    case 'twitch':
      return v.replace('twitch.tv/', '').trim();

    case 'youtube':
      return v
        .replace('youtube.com/@', '@')
        .replace('youtube.com/channel/', '')
        .replace('youtube.com/', '')
        .trim();

    case 'kick':
      return v.replace('kick.com/', '').trim();

    default:
      return v;
  }
}
