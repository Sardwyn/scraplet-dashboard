import { jest } from '@jest/globals';

const fetchMock = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: fetchMock,
  __esModule: true
}));

const { getStats } = await import('../../scripts/scrapers/kick.js');

describe('Kick scraper', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns follower and CCV metrics for a valid handle', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        followersCount: 1234,
        livestream: { viewer_count: 56 }
      })
    });

    const stats = await getStats('creator');

    expect(fetchMock).toHaveBeenCalledWith('https://kick.com/api/v1/channels/creator');
    expect(stats).toEqual({ followers: 1234, ccv: 56, engagement: 0 });
  });

  it('returns null when the Kick API responds with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const stats = await getStats('creator');

    expect(stats).toBeNull();
  });
});
