// /scrapbotDb.js
import pg from 'pg';

const { Pool } = pg;

const rawUrl =
  process.env.SCRAPBOT_DATABASE_URL || process.env.DATABASE_URL_SCRAPBOT;

if (!rawUrl) {
  console.warn(
    '[scrapbotDb] No SCRAPBOT_DATABASE_URL / DATABASE_URL_SCRAPBOT set. ' +
    'Scrapbot commands/accounts will NOT work until this is configured.'
  );
}

// If we have a URL, parse it into an explicit config so we *know*
// password is a plain string.
let poolConfig = null;

if (rawUrl) {
  try {
    const u = new URL(rawUrl);

    poolConfig = {
      user: decodeURIComponent(u.username),
      password: u.password ? String(u.password) : undefined,
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, ''),
      max: 10,
    };

    console.log('[scrapbotDb] Using config:', {
      user: poolConfig.user,
      host: poolConfig.host,
      port: poolConfig.port,
      database: poolConfig.database,
      passwordType: typeof poolConfig.password,
    });
  } catch (err) {
    console.error('[scrapbotDb] Failed to parse SCRAPBOT_DATABASE_URL:', err);
  }
}

let scrapbotDb;

if (!poolConfig) {
  // No valid config -> export a dummy pool that always throws,
  // so we don't get weird SASL errors, just a clear message.
  console.error(
    '[scrapbotDb] No valid DB config; scrapbot DB operations will fail.'
  );

  scrapbotDb = {
    async query() {
      throw new Error(
        'scrapbotDb not configured: set SCRAPBOT_DATABASE_URL or DATABASE_URL_SCRAPBOT'
      );
    },
  };
} else {
  scrapbotDb = new Pool(poolConfig);

  scrapbotDb.on('error', (err) => {
    console.error('[scrapbotDb] idle client error', err);
  });
}

export default scrapbotDb;
