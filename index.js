import './bootstrap/env.js';
import { startChatOutboxWorker } from "./services/chatOutboxDeliver.js";
import { startKickTokenRefreshWorker } from "./services/kickTokenRefreshWorker.js";
import { startBroadcasterBackfillWorker } from "./services/backfillBroadcasterIds.js";
import { initTikTokIngestManager } from "./services/tiktokChatIngest.js";
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import cors from 'cors';
import session from 'express-session';
import kickWebhookRoutes from './routes/kickWebhook.js';
import twitchWebhookRoutes from './routes/twitchWebhook.js';
import youtubeWebhookRoutes from './routes/youtubeWebhook.js';
import overlaysRouter from "./routes/overlays.js";
import scrapbotEvents from './routes/scrapbotEvents.js';
import integrationsRoutes from './routes/integrations.js';
import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import kickAuthRoutes from './routes/kickAuth.js';
import accountRoutes from './routes/account.js';
import publicRoutes from './routes/public.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import assetsApiRouter from "./routes/assetsApi.js";
import requireAuth from './utils/requireAuth.js';
import { EventBus } from './eventBus.js';
import eventsIngestRoutes from './routes/eventsIngest.js';
import dashboardMetricsRouter from './routes/dashboardMetrics.js';
import dashboardScrapbotRoutes from './routes/dashboardScrapbot.js';
import widgetsLoaderRoutes from './routes/widgets-loader.js';
import overlaysApiRouter from "./routes/api/overlays.js";
import lowerThirdTemplatesRouter from "./routes/api/lowerThirdTemplates.js";
import overlayComponentsRouter from "./routes/api/overlayComponents.js";
import discordIntegrationRoutes from "./routes/integrations/discord.js";
// import publicOverlayRouter from "./routes/publicOverlay.js";
import publicOverlayServing from "./routes/publicOverlayServing.js";
import uploadsRouter from "./routes/api/uploads.js";
import profileApiRoutes from './routes/profileApi.js';
import publicProfileApi from './routes/publicProfileApi.js';
import emailApiRoutes from './routes/emailApi.js';
import moderationProxyApi from './routes/moderationProxyApi.js';
import { registerChatOverlay } from "./src/widgets/chat-overlay/index.js";
import raffleEventsIngestRoutes from "./routes/raffleEventsIngest.js";
import subsEventsIngestRoutes from "./routes/subsEventsIngest.js";
import ttsRouter from "./src/tts/routes.js";
import overlayAlertsRouter from './routes/overlay/alerts.js';
//CASINO GAMES
import { registerBlackjack } from "./src/widgets/blackjack/index.js";
import { registerRoulette } from "./src/widgets/roulette/index.js";
import { registerPlinko } from "./src/widgets/plinko/index.js";
import { registerCrash } from "./src/widgets/crash/index.js";
import crashRoutes from "./src/domains/casino/crash/routes.js";

// INTEGRATIONS
import kickIntegrationsRouter from './routes/integrations/kick.js';
import youtubeIntegrationsRouter from './routes/integrations/youtube.js';
import youtubeChatDebugRouter from './routes/integrations/youtube_chat_debug.js';
import youtubeChatIngestRouter from './routes/integrations/youtube_chat_ingest.js';
import statusProxyRoutes from './routes/statusProxy.js';
import intelApiRouter from './routes/intelApi.js';
import { applyStartupMigrations } from './bootstrap/applyMigrations.js';


global.studioEventBus = new EventBus();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const maskDb = (s) =>
  (s || '').replace(/(:\/\/[^:]+:)([^@]+)@/, '$1***@');

console.log(
  'DATABASE_URL (effective):',
  maskDb(process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL)
);

const app = express();
const port = process.env.PORT || 3000;



// Public widget assets (OBS browser sources must be unauthenticated)
app.use(
  "/widgets",
  express.static(path.join(__dirname, "public", "widgets"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

// ✅ Skins are assets + config only (no logic). Mount from src/skins.
app.use(
  "/skins",
  express.static(path.join(__dirname, "src", "skins"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

// 🧠 DB sanity check (after env is loaded)
const { default: db } = await import('./db.js');

(async () => {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
    await applyStartupMigrations();
  } catch (error) {
    console.error('DB connection error:', error);
  }
})();


// 🧩 Express core setup
// ✅ CRITICAL behind nginx: enables req.secure via X-Forwarded-Proto
app.set('trust proxy', 1);

app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  ['/profile-assets', '/dashboard/profile-assets'],
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
  })
);

// 🔐 Session MUST come before anything that relies on req.session
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn(
    'SESSION_SECRET is not set. Falling back to an insecure default.'
  );
}

app.use(
  session({
    name: 'scraplet.sid',
    secret: sessionSecret || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'lax',
      secure: process.env.APP_MODE === 'local' ? false : 'auto', // Allow HTTP on localhost
      maxAge: 1000 * 60 * 60 * 24 // 1 day
    },
  })
);

app.use(crashRoutes);

//raffle widget
app.use("/dashboard/api/raffle", raffleEventsIngestRoutes);
//sub counter widget
app.use("/dashboard/api/subs", subsEventsIngestRoutes);

// Static assets for the dashboard app
app.use(express.static(path.join(__dirname, 'public')));
// Static assets under /dashboard/* (so Nginx proxy paths can load JS/CSS)
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

app.use(dashboardMetricsRouter);
app.use('/api/integrations', kickIntegrationsRouter);
app.use(youtubeIntegrationsRouter);
app.use(youtubeChatDebugRouter);

// Body parsing + JSON with rawBody
app.use(express.urlencoded({ extended: true }));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
    type: ['application/json', 'application/*+json'],
  })
);

app.use("/dashboard/api", assetsApiRouter);
app.use("/dashboard/api/uploads", uploadsRouter);
app.use("/dashboard", intelApiRouter);

//register apps and widgets here
registerChatOverlay(app);
registerBlackjack(app);
registerPlinko(app);
registerRoulette(app);
registerCrash(app);

app.use('/dashboard/api/public', publicProfileApi);
app.use(moderationProxyApi);
app.use("/api/tts", ttsRouter);
app.use("/integrations/discord", discordIntegrationRoutes);

app.get("/overlays/tts", (req, res, next) => {
  const originalUrl = req.url;
  req.url = "/overlays/tts" + (req._parsedUrl?.search || "");
  ttsRouter(req, res, (err) => {
    req.url = originalUrl;
    next(err);
  });
});

// SSE and EventBus Routes
app.get('/dashboard/api/events/stream', requireAuth, (req, res) => {
  const userId = req.session.user.id;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.flushHeaders();
  global.studioEventBus.subscribe(userId, res);
});

app.use('/dashboard/api/scrapbot/events', scrapbotEvents);
app.use('/dashboard/api/events/ingest', eventsIngestRoutes);

// 🌐 CORS
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://scraplet.store,https://scraplet.store,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // allow same-origin / server-to-server / curl / OBS / etc.
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      // ✅ do NOT error; just disable CORS headers for this request
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// 🔐 Dev-only login helper (disabled in production)
app.get('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not available');
  }

  try {
    const username = (req.query.user || 'Sardwyn').toString().trim();

    const result = await db.query(
      'SELECT id, username, avatar_url FROM users WHERE username = $1 LIMIT 1',
      [username]
    );

    if (!result.rows.length) {
      console.warn('dev-login: user not found', username);
      return res.status(404).send(`User ${username} not found`);
    }

    const user = result.rows[0];

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url || null,
    };

    console.log('dev-login OK for', user.username);
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('dev-login error:', err);
    return res.status(500).send('dev-login failed');
  }
});

// Widget Loader Routes
app.use('/', widgetsLoaderRoutes);

// Overlays Routes
app.use("/dashboard", overlaysRouter);
app.use("/dashboard/api", overlaysApiRouter);
app.use("/dashboard/api", lowerThirdTemplatesRouter);
app.use("/dashboard/api", overlayComponentsRouter);
// app.use("/", publicOverlayRouter);
app.use("/", publicOverlayServing);
// Phase 11: Public Overlay Event Gate (SSE)
import publicOverlaysApi from './routes/api/publicOverlays.js';
app.use('/api/overlays/public', publicOverlaysApi);

app.use(overlayAlertsRouter);

// Profile API Routes
app.use('/dashboard/api/profile', profileApiRoutes);

// Email API Routes
app.use('/dashboard/api/email', emailApiRoutes);

// Status Proxy Routes
app.use('/api/status', statusProxyRoutes);

// 🎛 Studio Controller — auth-gated React build
const studioDistPath = process.env.STUDIO_DIST_PATH || '/var/www/studio-controller/dist';

app.use('/studio', requireAuth, express.static(studioDistPath));
app.get(/^\/studio(\/.*)?$/, requireAuth, (req, res) => {
  res.sendFile(path.join(studioDistPath, 'index.html'));
});

// 🧭 Health
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 📡 Kick → Dashboard webhook (events API)
app.use(kickWebhookRoutes);
app.use(twitchWebhookRoutes);
app.use(youtubeWebhookRoutes);
app.use(youtubeChatIngestRouter);

// 🔀 Main routes
app.use(integrationsRoutes);
app.use('/dashboard', dashboardRoutes);

app.use('/auth', kickAuthRoutes);
app.use('/auth', authRoutes);

app.use('/account', accountRoutes);
app.use('/', publicRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use(dashboardScrapbotRoutes);

// 🧱 404
app.use((req, res) => {
  res.status(404).render('404');
});

// 🧱 500
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500');
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

startChatOutboxWorker();
initTikTokIngestManager().catch(console.error);
startKickTokenRefreshWorker();
startBroadcasterBackfillWorker();

