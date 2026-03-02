module.exports = {
  apps: [{
    name: 'scrapletdashboard',
    script: './index.js',
    cwd: '/var/www/scraplet/scraplet-dashboard',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,

      // Scrapbot commands/accounts DB (scrapbot_clean)
      SCRAPBOT_DATABASE_URL: 'postgres://scrapapp:Outrun1279@127.0.0.1:5432/scrapbot_clean',

      // Must match Scrapbot's SCRAPBOT_SYNC_SECRET
      SCRAPBOT_SYNC_SECRET: 'Outrun1279',

      // Internal API auth (must match Scrapbot's SCRAPBOT_SHARED_SECRET)
      SCRAPBOT_SHARED_SECRET: 'OutrunIsTheBestRacingGame1979',
      INTERNAL_SECRET: 'OutrunIsTheBestRacingGame1979',
    }
  },
  {
    name: "discord-bot-worker",
    script: "src/workers/discord-bot-worker.js",
    cwd: "/var/www/scraplet/scraplet-dashboard",
    env_file: "/var/www/scraplet/scraplet-dashboard/.env",
  }]
};
