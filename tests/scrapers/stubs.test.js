import { getStats as getInstagramStats } from '../../scripts/scrapers/instagram.js';
import { getStats as getTikTokStats } from '../../scripts/scrapers/tiktok.js';
import { getStats as getFacebookStats } from '../../scripts/scrapers/facebook.js';

describe('Placeholder scrapers', () => {
  it('return null until implemented', async () => {
    await expect(getInstagramStats('user')).resolves.toBeNull();
    await expect(getTikTokStats('user')).resolves.toBeNull();
    await expect(getFacebookStats('user')).resolves.toBeNull();
  });
});
