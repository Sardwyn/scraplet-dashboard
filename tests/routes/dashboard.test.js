import express from 'express';
import request from 'supertest';
import path from 'path';
import ejs from 'ejs';

import {
  resetMetrics,
  recordScraperRun,
  recordScraperSnapshot,
  recordApiStatus,
  recordTestRun,
  recordLayoutState,
  recordProfileRequest
} from '../../utils/metrics.js';

const dashboardRoutes = (await import('../../routes/dashboard.js')).default;

function createApp(sessionUser = null) {
  const app = express();
  app.engine('ejs', ejs.__express);
  app.set('views', path.resolve(process.cwd(), 'views'));
  app.set('view engine', 'ejs');
  app.use((req, res, next) => {
    req.session = req.session || {};
    if (sessionUser) {
      req.session.user = sessionUser;
    }
    next();
  });
  app.use('/dashboard', dashboardRoutes);
  return app;
}

describe('dashboard metrics view', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('redirects unauthenticated users to login', async () => {
    const response = await request(createApp()).get('/dashboard/metrics');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  it('renders aggregated metrics for authenticated users', async () => {
    process.env.ADMIN_METRICS_TOKEN = 'token';
    recordScraperRun({ platform: 'twitch', status: 'success' });
    recordScraperRun({ platform: 'twitch', status: 'failure' });
    recordScraperSnapshot({ userId: 42, platform: 'twitch', followers: 1234, ccv: 56, engagement: 7 });
    recordApiStatus({ service: 'stats', status: 'success', platform: 'twitch' });
    recordTestRun({ passed: 10, failed: 1, timestamp: Date.now() });
    recordLayoutState({
      userId: 42,
      layout: {
        sections: [
          { type: 'stats', visible: true }
        ],
        showButtonIcons: false
      }
    });
    recordProfileRequest({ userId: 42, username: 'creator', status: 'success' });

    const response = await request(createApp({ id: 42, username: 'creator' })).get('/dashboard/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Metrics Overview');
    expect(response.text).toContain('twitch');
    expect(response.text).toContain('1,234');
    expect(response.text).toContain('Open Raw Metrics');

    delete process.env.ADMIN_METRICS_TOKEN;
  });


  it('accepts trailing slashes on the metrics route', async () => {
    recordScraperRun({ platform: 'kick', status: 'success' });

    const response = await request(createApp({ id: 1, username: 'creator' })).get('/dashboard/metrics/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Metrics Overview');
  });

  it('redirects invalid tabs back to the dashboard', async () => {
    const response = await request(createApp({ id: 1, username: 'creator' })).get('/dashboard/unknown');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/dashboard');
  });

});
