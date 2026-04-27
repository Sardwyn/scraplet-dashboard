// ecosystem.scraper.config.cjs
require('dotenv').config({ path: __dirname + '/.env' });

module.exports = {
  apps: [{
    name: 'scraper-runner',
    script: './scraper-runner-v2.mjs',
    cwd: '/var/www/scraplet/scraplet-dashboard',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SCRAPE_INTERVAL_MS: '1800000',
      SCRAPER_HEALTH_PORT: '4321',
    },
  }],
};
