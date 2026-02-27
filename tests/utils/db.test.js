import { jest } from '@jest/globals';

describe('Database module', () => {
  let mockQuery;
  let PoolMock;
  let db;

  beforeEach(async () => {
    jest.resetModules();

    mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    const poolInstance = { query: mockQuery };
    PoolMock = jest.fn(() => poolInstance);

    jest.unstable_mockModule('pg', () => ({
      Pool: PoolMock,
      __esModule: true
    }));

    ({ default: db } = await import('../../db.js'));
  });

  it('creates a singleton pool instance', async () => {
    const first = db;
    const second = (await import('../../db.js')).default;

    expect(first).toBe(second);
    expect(PoolMock).toHaveBeenCalledTimes(1);
  });

  it('delegates query calls to the underlying pool', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);

    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    expect(result).toEqual({ rows: [{ id: 1 }] });
  });

  it('returns cached stats when data is within the TTL window', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          followers: { twitch: 100 },
          ccv: { twitch: 10 },
          engagement: {},
          marketability: 'A',
          last_updated: now
        }
      ]
    });

    const getStatsFromPlatform = jest.fn();

    jest.unstable_mockModule('../../scripts/scrapers/index.js', () => ({
      getStatsFromPlatform,
      __esModule: true
    }));

    const { getStatsForUser } = await import('../../scripts/stats.js');

    const result = await getStatsForUser({ userId: 1 });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain("last_updated > now() - interval '24 hours'");
    expect(getStatsFromPlatform).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      followers: { twitch: 100 },
      ccv: { twitch: 10 },
      marketability: 'A',
      last_updated: now
    });
  });
});
