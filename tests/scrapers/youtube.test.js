import { jest } from '@jest/globals';

process.env.YOUTUBE_API_KEY = 'test-key';

const fetchMock = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: fetchMock,
  __esModule: true
}));

const { getStats } = await import('../../scripts/scrapers/youtube.js');

describe('YouTube scraper', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns subscriber counts when the channel is found', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          items: [
            {
              snippet: { channelId: 'channel-123' }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          items: [
            {
              statistics: { subscriberCount: '9876' }
            }
          ]
        })
      });

    const stats = await getStats('https://youtube.com/@creator');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('youtube/v3/search');
    expect(fetchMock.mock.calls[1][0]).toContain('youtube/v3/channels');
    expect(stats).toEqual({ followers: 9876, ccv: 0, engagement: 0 });
  });

  it('returns null when the channel cannot be resolved', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ items: [] }) });

    const stats = await getStats('missing');

    expect(stats).toBeNull();
  });
});
