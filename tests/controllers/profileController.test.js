import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'path';
import ejs from 'ejs';

const mockQuery = jest.fn();
const mockGetStatsForUser = jest.fn();
const mockGradeMarketability = jest.fn();

jest.unstable_mockModule('../../db.js', () => ({
  default: { query: mockQuery },
  __esModule: true
}));

jest.unstable_mockModule('../../scripts/stats.js', () => ({
  getStatsForUser: mockGetStatsForUser,
  gradeMarketability: mockGradeMarketability,
  __esModule: true
}));

const publicRoutes = (await import('../../routes/public.js')).default;

const { resetMetrics } = await import('../../utils/metrics.js');



const { resetMetrics } = await import('../../utils/metrics.js');



const { resetMetrics } = await import('../../utils/metrics.js');



function createApp() {
  const app = express();
  app.engine('ejs', ejs.__express);
  app.set('views', path.resolve(process.cwd(), 'views'));
  app.set('view engine', 'ejs');
  app.use('/', publicRoutes);
  return app;
}

describe('Public profile controller', () => {
  beforeEach(() => {

    resetMetrics();


    resetMetrics();


    resetMetrics();


    mockQuery.mockReset();
    mockGetStatsForUser.mockReset();
    mockGradeMarketability.mockReset();
  });

  it('renders stats and omits hidden buttons', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'creator',
            display_name: 'Creator',
            avatar_url: '/avatar.png',
            bio: 'Hello world',
            layout: null,
            youtube: 'https://youtube.com/@creator',
            twitch: 'https://twitch.tv/creator',
            kick: null,
            instagram: null,
            tiktok: null,
            x: null,
            facebook: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, label: 'Support Me', url: 'https://twitch.tv/creator', visible: true, icon: null },
          { id: 2, label: 'Hidden Link', url: 'https://example.com', visible: false, icon: null }
        ]
      });

    mockGetStatsForUser.mockResolvedValue({
      followers: { twitch: 1200 },
      ccv: { twitch: 45 },
      engagement: {},
      apiStatus: { twitch: 'ok' },
      marketability: 'B'
    });

    const response = await request(createApp()).get('/u/creator');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Creator');
    expect(response.text).toContain('Support Me');
    expect(response.text).not.toContain('Hidden Link');
    expect(response.text).toContain('1,200');
    expect(response.text).toContain('45');
    expect(response.text).toContain('Marketability Grade');
    expect(mockGradeMarketability).not.toHaveBeenCalled();
  });

  it('falls back gracefully when stats fetch fails', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'creator',
            display_name: 'Creator',
            avatar_url: null,
            bio: null,
            layout: null,
            youtube: null,
            twitch: null,
            kick: null,
            instagram: null,
            tiktok: null,
            x: null,
            facebook: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    mockGetStatsForUser.mockRejectedValue(new Error('API offline'));

    const response = await request(createApp()).get('/u/creator');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Stats unavailable');
    expect(mockGradeMarketability).not.toHaveBeenCalled();
  });

  it('omits stats section when layout hides it', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'creator',
            display_name: 'Creator',
            avatar_url: '/avatar.png',
            bio: 'Hello world',
            layout: JSON.stringify({
              sections: [
                { type: 'avatar', visible: true },
                { type: 'bio', visible: true },
                { type: 'socialLinks', visible: true },
                { type: 'stats', visible: false }
              ],
              showButtonIcons: true
            }),
            youtube: null,
            twitch: null,
            kick: null,
            instagram: null,
            tiktok: null,
            x: null,
            facebook: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    mockGetStatsForUser.mockResolvedValue({
      followers: { twitch: 1200 },
      ccv: { twitch: 45 },
      engagement: {},
      apiStatus: { twitch: 'ok' },
      marketability: 'B'
    });

    const response = await request(createApp()).get('/u/creator');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('📊 Reach & Engagement');
    expect(response.text).not.toContain('Stats unavailable');
    expect(response.text).not.toContain('Marketability Grade');
  });

  it('treats string "false" visibility values as hidden', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'creator',
            display_name: 'Creator',
            avatar_url: '/avatar.png',
            bio: 'Hello world',
            layout: JSON.stringify({
              sections: [
                { type: 'avatar', visible: 'true' },
                { type: 'stats', visible: 'false' }
              ],
              showButtonIcons: true
            }),
            youtube: null,
            twitch: null,
            kick: null,
            instagram: null,
            tiktok: null,
            x: null,
            facebook: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    mockGetStatsForUser.mockResolvedValue({
      followers: { twitch: 1200 },
      ccv: { twitch: 45 },
      engagement: {},
      apiStatus: { twitch: 'ok' },
      marketability: 'B'
    });

    const response = await request(createApp()).get('/u/creator');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('📊 Reach & Engagement');
  });
});
