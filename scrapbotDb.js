// /scrapbotDb.js
import './bootstrap/env.js';
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

let scrapbotDb;

if (!rawUrl) {
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
  scrapbotDb = new Pool({
    connectionString: rawUrl,
    ssl: false,
  });

  scrapbotDb.on('error', (err) => {
    console.error('[scrapbotDb] idle client error', err);
  });
}

export default scrapbotDb;
