import { jest } from '@jest/globals';

const fetchMock = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: fetchMock,
  __esModule: true
}));

const { getStats } = await import('../../scripts/scrapers/twitch.js');

describe('Twitch scraper', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('normalises the handle and parses the follower count', async () => {
    fetchMock.mockResolvedValue({
      text: async () => 'Followers: 1,234 viewers'
    });

    const stats = await getStats('https://twitch.tv/tester');

    expect(fetchMock).toHaveBeenCalledWith('https://decapi.me/twitch/followcount/tester');
    expect(stats).toEqual({ followers: 1234, ccv: 0, engagement: 0 });
  });

  it('returns null for an invalid handle', async () => {
    const stats = await getStats('');

    expect(stats).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    const stats = await getStats('tester');

    expect(stats).toBeNull();
  });
});
