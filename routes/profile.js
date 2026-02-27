// routes/profile.js
import express from 'express';
import requireAuth from '../utils/requireAuth.js';
import { recordLayoutState } from '../utils/metrics.js';
import { loadProfileByUserId } from '../services/profileService.js';
import db from '../db.js';

const router = express.Router();

/**
 * Helper: is Pro user?
 */
function isProUser(sessionUser) {
  if (!sessionUser) return false;
  const plan = (sessionUser.plan || sessionUser.subscription_plan || '').toString();
  return plan.toLowerCase() === 'pro' || plan.toLowerCase() === 'premium';
}

/**
 * GET /profile
 */
router.get('/', requireAuth, (req, res) => {
  return res.redirect('/profile/editor');
});

/**
 * GET /profile/editor
 */
router.get('/editor', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;

  if (!userId) return res.redirect('/auth/login');

  try {
    const bundle = await loadProfileByUserId(userId);

    if (!bundle) {
      return res.status(404).send('Profile not found');
    }

    const {
      profile,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability,
      appearance,
      sponsors,
      blocks,
    } = bundle;

    try {
      recordLayoutState({ userId, layout });
    } catch (err) {
      console.warn('[profile/editor] recordLayoutState failed:', err.message);
    }

    return res.render('layout', {
      tabView: 'profile-editor',
      user: sessionUser,

      profile,
      layout,
      sectionVisibility,
      customButtons,
      stats,
      marketability,
      appearance,
      sponsors: Array.isArray(sponsors) ? sponsors : [],
      blocks,
    });
  } catch (err) {
    console.error('Error loading profile editor:', err);
    return res.status(500).send('Failed to load profile editor');
  }
});

/**
 * GET /profile/configure
 */
router.get('/configure', requireAuth, (req, res) => {
  return res.redirect('/profile/editor');
});

/**
 * GET /profile/email
 *
 * Email hub – server-rendered (stable).
 */
router.get('/email', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;

  if (!userId) return res.redirect('/auth/login');

  try {
    // Summary metrics
    const {
      rows: [summary],
    } = await db.query(
      `
      SELECT
        (SELECT COUNT(*)::int
           FROM email_subscribers
          WHERE user_id = $1) AS total_contacts,
        (SELECT COUNT(*)::int
           FROM email_subscribers
          WHERE user_id = $1
            AND unsubscribed = false) AS active_contacts,
        (SELECT MAX(sent_at)
           FROM email_sends
          WHERE user_id = $1) AS last_email_sent_at,
        (SELECT COUNT(*)::int
           FROM email_sends
          WHERE user_id = $1
            AND kind = 'go_live'
            AND sent_at >= date_trunc('month', now())) AS go_live_emails_this_month
      `,
      [userId]
    );

    // Subscribers list (filterable)
    const subscribersStatus = (req.query?.status || 'active').toString().toLowerCase();
    const subscribersSearch = (req.query?.search || '').toString().trim();

    const subsWhere = ['user_id = $1'];
    const subsParams = [userId];
    let subsP = 2;

    if (subscribersStatus === 'unsubscribed') {
      subsWhere.push('unsubscribed = true');
    } else if (subscribersStatus === 'all') {
      // no-op
    } else {
      subsWhere.push('unsubscribed = false');
    }

    if (subscribersSearch) {
      subsWhere.push(`email ILIKE $${subsP++}`);
      subsParams.push(`%${subscribersSearch}%`);
    }

    const { rows: subscribers } = await db.query(
      `
      SELECT
        email,
        source_slug,
        created_at,
        unsubscribed
      FROM email_subscribers
      WHERE ${subsWhere.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 500
      `,
      subsParams
    );

    // Email settings
    const { rows: settingsRows } = await db.query(
      `
      SELECT
        go_live_email_kick_enabled,
        go_live_email_twitch_enabled,
        go_live_email_youtube_enabled,
        last_go_live_email_at
      FROM email_settings
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    const emailSettings =
      settingsRows[0] || {
        go_live_email_kick_enabled: false,
        go_live_email_twitch_enabled: false,
        go_live_email_youtube_enabled: false,
        last_go_live_email_at: null,
      };

    // Overview mapping (for the cards in tabs/email.ejs)
    const emailOverview = {
      totalSubscribers: Number(summary?.total_contacts || 0),
      activeSubscribers: Number(summary?.active_contacts || 0),
      lastSendAt: summary?.last_email_sent_at || null,
      goLiveThisMonth: Number(summary?.go_live_emails_this_month || 0),
    };

    // =========================
    // Templates listing
    // =========================
    const [{ rows: systemTemplates }, { rows: userTemplates }] = await Promise.all([
      db.query(
        `
        SELECT
          id,
          user_id,
          name,
          description,
          kind,
          subject,
          is_default,
          COALESCE(updated_at, created_at) AS updated_at
        FROM email_templates
        WHERE user_id IS NULL
        ORDER BY kind ASC, name ASC, id ASC
        `
      ),
      db.query(
        `
        SELECT
          id,
          user_id,
          name,
          description,
          kind,
          subject,
          is_default,
          COALESCE(updated_at, created_at) AS updated_at
        FROM email_templates
        WHERE user_id = $1
        ORDER BY kind ASC, name ASC, id ASC
        `,
        [userId]
      ),
    ]);

    const emailTemplateCounts = {
      systemTemplates: systemTemplates.length,
      userTemplates: userTemplates.length,
    };

    // Campaign counts
    const { rows: campRows } = await db.query(
      `
      SELECT
        COUNT(*) AS total_campaigns,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft_campaigns,
        COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled_campaigns,
        COUNT(*) FILTER (WHERE status = 'sent') AS sent_campaigns
      FROM public.email_campaigns
      WHERE user_id = $1
      `,
      [userId]
    );

    const campaignCountsRow = campRows[0] || {};
    const emailCampaignCounts = {
      totalCampaigns: Number(campaignCountsRow.total_campaigns || 0),
      draftCampaigns: Number(campaignCountsRow.draft_campaigns || 0),
      scheduledCampaigns: Number(campaignCountsRow.scheduled_campaigns || 0),
      sentCampaigns: Number(campaignCountsRow.sent_campaigns || 0),
    };

    // Campaign list (for the Campaigns tab)
    const { rows: emailCampaigns } = await db.query(
      `
      SELECT
        c.id,
        c.name,
        c.status,
        c.template_id,
        c.scheduled_at,
        c.created_at,
        c.updated_at,
        MAX(s.sent_at) AS last_sent_at,
        MAX(s.recipients) AS last_recipients
      FROM email_campaigns c
      LEFT JOIN email_sends s
        ON s.campaign_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    return res.render('layout', {
      tabView: 'tabs/email',
      user: sessionUser,

      isPro: isProUser(sessionUser),

      emailOverview,
      emailSettings,

      emailSubscribers: subscribers || [],
      subscribersStatus,
      subscribersSearch,
      emailSummary: summary || {},

      systemTemplates: systemTemplates || [],
      userTemplates: userTemplates || [],
      emailTemplateCounts,

      emailCampaignCounts,
      emailCampaigns: emailCampaigns || [],
    });
  } catch (err) {
    console.error('Error loading email list:', err);
    return res.status(500).send('Failed to load email list');
  }
});

/**
 * POST /profile/email/settings
 */
router.post('/email/settings', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;

  if (!userId) return res.redirect('/auth/login');

  try {
    const kickEnabled = !!req.body.go_live_email_kick_enabled;

    await db.query(
      `
      INSERT INTO email_settings (
        user_id,
        go_live_email_kick_enabled
      )
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        go_live_email_kick_enabled = EXCLUDED.go_live_email_kick_enabled
      `,
      [userId, kickEnabled]
    );

    return res.redirect('/profile/email');
  } catch (err) {
    console.error('Error saving email settings:', err);
    return res.status(500).send('Failed to save email settings');
  }
});

/**
 * GET /profile/email/templates/:id.json
 * Fetch a template (system or user-owned) for modal viewing.
 */
router.get('/email/templates/:id.json', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  const id = Number(req.params.id);

  if (!userId) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid id' });

  try {
    const { rows } = await db.query(
      `
      SELECT
        id,
        user_id,
        name,
        description,
        kind,
        subject,
        html_body,
        text_body,
        is_default,
        created_at,
        updated_at
      FROM email_templates
      WHERE id = $1
        AND (user_id = $2 OR user_id IS NULL)
      LIMIT 1
      `,
      [id, userId]
    );

    const tpl = rows[0];
    if (!tpl) return res.status(404).json({ ok: false, error: 'Not found' });

    return res.json({
      ok: true,
      template: {
        id: tpl.id,
        user_id: tpl.user_id,
        name: tpl.name,
        description: tpl.description,
        kind: tpl.kind,
        subject: tpl.subject,
        html_body: tpl.html_body,
        text_body: tpl.text_body,
        is_default: !!tpl.is_default,
        created_at: tpl.created_at,
        updated_at: tpl.updated_at,
      },
    });
  } catch (err) {
    console.error('[email] template json error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /profile/email/templates/:id/clone
 * Clone a system template into a user-owned template (Pro).
 */
router.post('/email/templates/:id/clone', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  const id = Number(req.params.id);

  if (!userId || !Number.isFinite(id)) {
    return res.redirect('/profile/email');
  }

  try {
    const { rows } = await db.query(
      `
      SELECT
        name,
        description,
        kind,
        subject,
        html_body,
        text_body
      FROM email_templates
      WHERE id = $1
        AND user_id IS NULL
      LIMIT 1
      `,
      [id]
    );

    const src = rows[0];
    if (!src) {
      return res.redirect('/profile/email');
    }

    await db.query(
      `
      INSERT INTO email_templates (
        user_id,
        name,
        description,
        kind,
        subject,
        html_body,
        text_body,
        is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      `,
      [
        userId,
        `${src.name} (copy)`,
        src.description,
        src.kind,
        src.subject,
        src.html_body,
        src.text_body,
      ]
    );

    return res.redirect('/profile/email#templates');
  } catch (err) {
    console.error('[email] clone failed:', err);
    return res.redirect('/profile/email');
  }
});

/**
 * GET /profile/email/templates/:id/edit.json
 */
router.get('/email/templates/:id/edit.json', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  const id = Number(req.params.id);

  const { rows } = await db.query(
    `
    SELECT id, name, subject, html_body, text_body
    FROM email_templates
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [id, userId]
  );

  if (!rows[0]) return res.status(404).json({ ok: false });

  res.json({ ok: true, template: rows[0] });
});

/**
 * POST /profile/email/templates/:id/edit
 */
router.post('/email/templates/:id/edit', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  const id = Number(req.params.id);
  const { subject, html_body, text_body } = req.body;

  await db.query(
    `
    UPDATE email_templates
    SET subject = $1,
        html_body = $2,
        text_body = $3,
        updated_at = now()
    WHERE id = $4 AND user_id = $5
    `,
    [subject, html_body, text_body, id, userId]
  );

  res.redirect('/profile/email#templates');
});

/**
 * POST /profile/email/campaigns/create
 * Create a draft campaign (Pro).
 */
router.post('/email/campaigns/create', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;

  if (!userId) return res.redirect('/auth/login');
  if (!isProUser(sessionUser)) return res.redirect('/profile/email#campaigns');

  const name = (req.body?.name || '').toString().trim() || 'Untitled campaign';
  const templateId = Number(req.body?.template_id);

  if (!Number.isFinite(templateId) || templateId <= 0) {
    return res.redirect('/profile/email#campaigns');
  }

  try {
    const { rows: tplRows } = await db.query(
      `
      SELECT id
      FROM email_templates
      WHERE id = $1
        AND (user_id IS NULL OR user_id = $2)
      LIMIT 1
      `,
      [templateId, userId]
    );

    if (!tplRows.length) return res.redirect('/profile/email#campaigns');

    await db.query(
      `
      INSERT INTO email_campaigns (user_id, template_id, name, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'draft', now(), now())
      `,
      [userId, templateId, name]
    );

    return res.redirect('/profile/email#campaigns');
  } catch (err) {
    console.error('[email] create campaign failed:', err);
    return res.redirect('/profile/email#campaigns');
  }
});

/**
 * POST /profile/email/campaigns/:id/send
 * Queue a campaign to send now (Pro).
 *
 * Enqueues: email_jobs(kind='campaign_send', payload {campaign_id})
 */
router.post('/email/campaigns/:id/send', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  const campaignId = Number(req.params.id);

  if (!userId) return res.redirect('/auth/login');
  if (!isProUser(sessionUser)) return res.redirect('/profile/email#campaigns');

  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return res.redirect('/profile/email#campaigns');
  }

  try {
    const { rows } = await db.query(
      `
      SELECT id, status
      FROM email_campaigns
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [campaignId, userId]
    );

    const camp = rows[0];
    if (!camp) return res.redirect('/profile/email#campaigns');

    if ((camp.status || '').toLowerCase() === 'sent') {
      return res.redirect('/profile/email#campaigns');
    }

    await db.query(
      `
      INSERT INTO email_jobs (user_id, kind, payload, status, created_at, updated_at)
      VALUES ($1, 'campaign_send', $2::jsonb, 'pending', now(), now())
      `,
      [userId, JSON.stringify({ campaign_id: campaignId })]
    );

    await db.query(
      `
      UPDATE email_campaigns
      SET status = 'scheduled',
          scheduled_at = now(),
          updated_at = now()
      WHERE id = $1 AND user_id = $2
      `,
      [campaignId, userId]
    );

    return res.redirect('/profile/email#campaigns');
  } catch (err) {
    console.error('[email] send campaign failed:', err);
    return res.redirect('/profile/email#campaigns');
  }
});

/**
 * GET /profile/email/subscribers.csv
 * Export subscribers as CSV (Pro).
 */
router.get('/email/subscribers.csv', requireAuth, async (req, res) => {
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;

  if (!userId) return res.redirect('/auth/login');
  if (!isProUser(sessionUser)) return res.redirect('/profile/email#subscribers');

  const status = (req.query?.status || 'active').toString().toLowerCase();
  const search = (req.query?.search || '').toString().trim();

  const where = ['user_id = $1'];
  const params = [userId];
  let p = 2;

  if (status === 'unsubscribed') {
    where.push('unsubscribed = true');
  } else if (status === 'all') {
    // no-op
  } else {
    where.push('unsubscribed = false');
  }

  if (search) {
    where.push(`email ILIKE $${p++}`);
    params.push(`%${search}%`);
  }

  try {
    const { rows } = await db.query(
      `
      SELECT email, source_slug, created_at, unsubscribed
      FROM email_subscribers
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      `,
      params
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');

    const lines = [];
    lines.push('email,source_slug,created_at,unsubscribed');

    for (const r of rows) {
      const email = String(r.email || '').replace(/"/g, '""');
      const source = String(r.source_slug || '').replace(/"/g, '""');
      const created = r.created_at ? new Date(r.created_at).toISOString() : '';
      const unsub = r.unsubscribed ? 'true' : 'false';
      lines.push(`"${email}","${source}","${created}","${unsub}"`);
    }

    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('[email] export csv failed:', err);
    return res.redirect('/profile/email#subscribers');
  }
});

export default router;
