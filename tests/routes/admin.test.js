import express from 'express';
import request from 'supertest';
import {
  resetMetrics,
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus,
  recordTestRun,
  recordLayoutState,
  recordProfileRequest
} from '../../utils/metrics.js';

describe('/admin/metrics', () => {
  let app;

  beforeEach(async () => {
    resetMetrics();
    process.env.ADMIN_METRICS_TOKEN = 'secret';
    const adminRoutes = (await import('../../routes/admin.js')).default;
    app = express();
    app.use('/admin', adminRoutes);
  });

  afterEach(() => {
    delete process.env.ADMIN_METRICS_TOKEN;
  });

  it('rejects requests without a valid token', async () => {
    const response = await request(app).get('/admin/metrics');
    expect(response.status).toBe(401);
  });

  it('returns Prometheus formatted metrics when authorized', async () => {
    recordScraperRun({ platform: 'twitch', status: 'success' });
    recordScraperSnapshot({ userId: 1, platform: 'twitch', followers: 123, ccv: 45, engagement: 6 });
    recordApiStatus({ service: 'scraper', status: 'success', platform: 'twitch' });
    recordTestRun({ passed: 10, failed: 1, timestamp: Date.now() });
    recordLayoutState({
      userId: 1,
      layout: {
        sections: [
          { type: 'stats', visible: true }
        ],
        showButtonIcons: true
      }
    });
    recordProfileRequest({ userId: 1, username: 'creator', status: 'success' });

    const response = await request(app)
      .get('/admin/metrics')
      .set('x-admin-token', 'secret');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('scraper_success_total{platform="twitch"} 1');
    expect(response.text).toContain('follower_count{user_id="1",platform="twitch"} 123');
    expect(response.text).toContain('profile_views_by_user_total{user_id="1",username="creator"} 1');
  });
});
