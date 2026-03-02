module.exports = {
  apps: [{
    name: 'scrapletdashboard',
    script: './index.js',
    cwd: '/var/www/scraplet/scraplet-dashboard',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  },
  {
    name: "discord-bot-worker",
    script: "src/workers/discord-bot-worker.js",
    cwd: "/var/www/scraplet/scraplet-dashboard",
    env_file: "/var/www/scraplet/scraplet-dashboard/.env",
  }]
};
