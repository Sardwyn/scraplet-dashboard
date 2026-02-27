// routes/emailApi.js
import express from 'express';
import db from '../db.js';
import requireAuth from '../utils/requireAuth.js';

const router = express.Router();

/**
 * Helper: is Pro user?
 * Mirrors profileApi.js.
 */
function isProUser(sessionUser) {
  const plan = sessionUser?.plan || sessionUser?.subscription_plan;
  return plan === 'pro' || plan === 'PRO' || plan === 'Premium';
}

/**
 * Normalise a boolean-ish input from body/query.
 */
function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
  }
  return false;
}

/**
 * Parse integer safely.
 */
function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * ---------------------------
 * EMAIL TEMPLATES
 * ---------------------------
 */

/**
 * GET /dashboard/api/email/templates?kind=go_live|campaign
 * Returns all visible templates (system + user-owned).
 */
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { kind } = req.query;
    const params = [userId];
    const where = ['(user_id IS NULL OR user_id = $1)'];

    if (kind && typeof kind === 'string') {
      params.push(kind);
      where.push(`kind = $${params.length}`);
    }

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
      WHERE ${where.join(' AND ')}
      ORDER BY
        (user_id IS NULL) DESC,  -- system first
        created_at ASC
      `,
      params
    );

    const pro = isProUser(sessionUser);

    const templates = rows.map((t) => ({
      ...t,
      is_system: t.user_id === null,
      editable: pro && t.user_id === userId,
    }));

    return res.json({ ok: true, templates, isProUser: pro });
  } catch (err) {
    console.error('[emailApi] GET /templates failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/templates
 * Body: { kind, name, description?, subject, html_body?, text_body? }
 * Pro-only. Creates a user-owned template.
 */
router.post('/templates', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email templates are a Pro feature' });
    }

    let { kind, name, description, subject, html_body, text_body } =
      req.body || {};

    kind = (kind || '').toString().trim();
    name = (name || '').toString().trim();
    description = (description || '').toString().trim();
    subject = (subject || '').toString().trim();
    html_body = (html_body || '').toString();
    text_body = (text_body || '').toString();

    if (!kind) {
      return res
        .status(400)
        .json({ ok: false, error: 'Template kind is required' });
    }

    if (!name) {
      return res
        .status(400)
        .json({ ok: false, error: 'Template name is required' });
    }

    if (!subject) {
      return res
        .status(400)
        .json({ ok: false, error: 'Subject is required' });
    }

    const { rows } = await db.query(
      `
      INSERT INTO email_templates (
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
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())
      RETURNING
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
      `,
      [userId, name, description || null, kind, subject, html_body, text_body]
    );

    const tpl = rows[0];

    return res.status(201).json({
      ok: true,
      template: {
        ...tpl,
        is_system: false,
        editable: true,
      },
    });
  } catch (err) {
    console.error('[emailApi] POST /templates failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * PUT /dashboard/api/email/templates/:id
 * Pro-only. Can only update user-owned templates.
 */
router.put('/templates/:id', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email templates are a Pro feature' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Invalid template ID' });
    }

    let { name, description, subject, html_body, text_body } = req.body || {};

    name = (name || '').toString().trim();
    description = (description || '').toString().trim();
    subject = (subject || '').toString().trim();
    html_body = (html_body || '').toString();
    text_body = (text_body || '').toString();

    if (!name) {
      return res
        .status(400)
        .json({ ok: false, error: 'Template name is required' });
    }

    if (!subject) {
      return res
        .status(400)
        .json({ ok: false, error: 'Subject is required' });
    }

    // Ensure template is owned by this user (cannot edit system templates)
    const { rowCount } = await db.query(
      `
      UPDATE email_templates
      SET
        name        = $1,
        description = $2,
        subject     = $3,
        html_body   = $4,
        text_body   = $5,
        updated_at  = NOW()
      WHERE id = $6
        AND user_id = $7
      `,
      [name, description || null, subject, html_body, text_body, id, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Template not found or not owned by user',
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[emailApi] PUT /templates/:id failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/templates/:id/clone
 * Pro-only. Clones an existing template (system or user-owned) as user-owned.
 */
router.post('/templates/:id/clone', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email templates are a Pro feature' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Invalid template ID' });
    }

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
        text_body
      FROM email_templates
      WHERE id = $1
        AND (user_id IS NULL OR user_id = $2)
      LIMIT 1
      `,
      [id, userId]
    );

    const src = rows[0];
    if (!src) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    const clonedName =
      src.user_id === null
        ? `${src.name} (Copy)`
        : `${src.name} (Clone)`;

    const insert = await db.query(
      `
      INSERT INTO email_templates (
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
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())
      RETURNING
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
      `,
      [
        userId,
        clonedName,
        src.description || null,
        src.kind,
        src.subject,
        src.html_body,
        src.text_body,
      ]
    );

    const tpl = insert.rows[0];

    return res.status(201).json({
      ok: true,
      template: {
        ...tpl,
        is_system: false,
        editable: true,
      },
    });
  } catch (err) {
    console.error('[emailApi] POST /templates/:id/clone failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/templates/:id/test
 * Queues a test send for a go_live template.
 * (Campaign tests will be done via campaign-specific route later.)
 */
router.post('/templates/:id/test', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Invalid template ID' });
    }

    const { rows } = await db.query(
      `
      SELECT
        id,
        user_id,
        kind
      FROM email_templates
      WHERE id = $1
        AND (user_id IS NULL OR user_id = $2)
      LIMIT 1
      `,
      [id, userId]
    );

    const tpl = rows[0];
    if (!tpl) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    if (tpl.kind !== 'go_live') {
      return res.status(400).json({
        ok: false,
        error: 'Only go_live templates can be tested via this endpoint',
      });
    }

    // Queue a test_go_live job – worker will pick creator email.
    await db.query(
      `
      INSERT INTO email_jobs (user_id, kind, payload, status, created_at, updated_at)
      VALUES ($1, 'test_go_live', $2::jsonb, 'pending', NOW(), NOW())
      `,
      [userId, JSON.stringify({ template_id: tpl.id })]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[emailApi] POST /templates/:id/test failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * ---------------------------
 * GO-LIVE SETTINGS
 * ---------------------------
 */

/**
 * GET /dashboard/api/email/settings
 * Returns go-live email settings for the current user.
 */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const { rows } = await db.query(
      `
      SELECT
        go_live_email_kick_enabled,
        go_live_template_id,
        last_go_live_email_at
      FROM email_settings
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    const row = rows[0] || null;

    const payload = row
      ? {
          go_live_email_kick_enabled: !!row.go_live_email_kick_enabled,
          go_live_template_id: row.go_live_template_id,
          last_go_live_email_at: row.last_go_live_email_at,
        }
      : {
          go_live_email_kick_enabled: false,
          go_live_template_id: null,
          last_go_live_email_at: null,
        };

    return res.json({
      ok: true,
      settings: payload,
      isProUser: isProUser(sessionUser),
      hasSettingsRow: !!row,
    });
  } catch (err) {
    console.error('[emailApi] GET /settings failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/settings
 * Body: { go_live_email_kick_enabled, go_live_template_id }
 * Controls "email my list when I go live on Kick" + template choice.
 */
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const pro = isProUser(sessionUser);

    let { go_live_email_kick_enabled, go_live_template_id } = req.body || {};
    const enabled = toBool(go_live_email_kick_enabled);
    const templateId = toInt(go_live_template_id);

    let finalTemplateId = null;

    if (templateId) {
      // Lookup template and enforce visibility + kind
      const { rows } = await db.query(
        `
        SELECT id, user_id, kind
        FROM email_templates
        WHERE id = $1
          AND kind = 'go_live'
          AND (user_id IS NULL OR user_id = $2)
        LIMIT 1
        `,
        [templateId, userId]
      );

      const tpl = rows[0];
      if (!tpl) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid go-live template selected',
        });
      }

      if (tpl.user_id && !pro) {
        return res.status(403).json({
          ok: false,
          error: 'Custom go-live templates are a Pro feature',
        });
      }

      finalTemplateId = tpl.id;
    }

    // Upsert into email_settings. We assume user_id is UNIQUE in this table.
    const { rowCount } = await db.query(
      `
      UPDATE email_settings
      SET
        go_live_email_kick_enabled = $1,
        go_live_template_id        = $2,
        updated_at                 = NOW()
      WHERE user_id = $3
      `,
      [enabled, finalTemplateId, userId]
    );

    if (rowCount === 0) {
      await db.query(
        `
        INSERT INTO email_settings (
          user_id,
          go_live_email_kick_enabled,
          go_live_template_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, NOW(), NOW())
        `,
        [userId, enabled, finalTemplateId]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[emailApi] POST /settings failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * ---------------------------
 * CAMPAIGNS
 * ---------------------------
 */

/**
 * GET /dashboard/api/email/campaigns
 * Pro-only. Returns recent campaigns + basic last-send info.
 */
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email campaigns are a Pro feature' });
    }

    const { rows } = await db.query(
      `
      SELECT
        c.id,
        c.user_id,
        c.name,
        c.template_id,
        c.status,
        c.scheduled_at,
        c.created_at,
        c.updated_at,
        COALESCE(MAX(es.sent_at), NULL)      AS last_sent_at,
        COALESCE(SUM(es.recipients), 0)     AS total_recipients
      FROM email_campaigns c
      LEFT JOIN email_sends es
        ON es.campaign_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    return res.json({ ok: true, campaigns: rows });
  } catch (err) {
    console.error('[emailApi] GET /campaigns failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/campaigns
 * Body: { template_id, name, scheduled_at? }
 * Pro-only. Creates a campaign in draft/scheduled state.
 */
router.post('/campaigns', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email campaigns are a Pro feature' });
    }

    let { template_id, name, scheduled_at } = req.body || {};

    const templateId = toInt(template_id);
    name = (name || '').toString().trim();
    scheduled_at = (scheduled_at || '').toString().trim();

    if (!templateId) {
      return res
        .status(400)
        .json({ ok: false, error: 'template_id is required' });
    }

    if (!name) {
      return res
        .status(400)
        .json({ ok: false, error: 'Campaign name is required' });
    }

    // Ensure template is visible to user and of kind 'campaign'
    const { rows: tplRows } = await db.query(
      `
      SELECT id, user_id, kind
      FROM email_templates
      WHERE id = $1
        AND kind = 'campaign'
        AND (user_id IS NULL OR user_id = $2)
      LIMIT 1
      `,
      [templateId, userId]
    );

    const tpl = tplRows[0];
    if (!tpl) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid campaign template selected',
      });
    }

    const hasSchedule = scheduled_at.length > 0;

    const insert = await db.query(
      `
      INSERT INTO email_campaigns (
        user_id,
        template_id,
        name,
        status,
        scheduled_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING
        id,
        user_id,
        template_id,
        name,
        status,
        scheduled_at,
        created_at,
        updated_at
      `,
      [
        userId,
        templateId,
        name,
        hasSchedule ? 'scheduled' : 'draft',
        hasSchedule ? scheduled_at : null,
      ]
    );

    return res.status(201).json({ ok: true, campaign: insert.rows[0] });
  } catch (err) {
    console.error('[emailApi] POST /campaigns failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * POST /dashboard/api/email/campaigns/:id/send_now
 * Pro-only. Queues a campaign_send job and marks campaign queued.
 */
router.post('/campaigns/:id/send_now', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Email campaigns are a Pro feature' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Invalid campaign ID' });
    }

    const { rows } = await db.query(
      `
      SELECT id, user_id, status
      FROM email_campaigns
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [id, userId]
    );

    const campaign = rows[0];
    if (!campaign) {
      return res
        .status(404)
        .json({ ok: false, error: 'Campaign not found' });
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        ok: false,
        error: 'Campaign cannot be sent in its current status',
      });
    }

    await db.query(
      `
      INSERT INTO email_jobs (user_id, kind, payload, status, created_at, updated_at)
      VALUES ($1, 'campaign_send', $2::jsonb, 'pending', NOW(), NOW())
      `,
      [userId, JSON.stringify({ campaign_id: id })]
    );

    await db.query(
      `
      UPDATE email_campaigns
      SET status = 'queued',
          updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[emailApi] POST /campaigns/:id/send_now failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * ---------------------------
 * SUBSCRIBERS
 * ---------------------------
 */

/**
 * GET /dashboard/api/email/subscribers?page=1&pageSize=50
 * Returns paginated subscriber list for current user.
 */
router.get('/subscribers', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    let page = toInt(req.query.page) || 1;
    let pageSize = toInt(req.query.pageSize) || 50;

    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 50;
    if (pageSize > 200) pageSize = 200;

    const offset = (page - 1) * pageSize;

    const countResult = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM email_subscribers
      WHERE user_id = $1
      `,
      [userId]
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const { rows } = await db.query(
      `
      SELECT
        email,
        created_at,
        unsubscribed,
        source_slug
      FROM email_subscribers
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, pageSize, offset]
    );

    return res.json({
      ok: true,
      subscribers: rows,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (err) {
    console.error('[emailApi] GET /subscribers failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * GET /dashboard/api/email/subscribers/export
 * Pro-only. Exports all subscribers as CSV.
 */
router.get('/subscribers/export', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!isProUser(sessionUser)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Subscriber export is a Pro feature' });
    }

    const { rows } = await db.query(
      `
      SELECT
        email,
        created_at,
        unsubscribed,
        source_slug
      FROM email_subscribers
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    const header = ['email', 'created_at', 'unsubscribed', 'source_slug'];
    const lines = [header.join(',')];

    for (const r of rows) {
      const vals = [
        `"${(r.email || '').replace(/"/g, '""')}"`,
        r.created_at ? r.created_at.toISOString() : '',
        r.unsubscribed ? 'true' : 'false',
        `"${(r.source_slug || '').replace(/"/g, '""')}"`,
      ];
      lines.push(vals.join(','));
    }

    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="subscribers.csv"'
    );
    return res.send(csv);
  } catch (err) {
    console.error('[emailApi] GET /subscribers/export failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

/**
 * ---------------------------
 * EMAIL STATS
 * ---------------------------
 */

/**
 * GET /dashboard/api/email/stats
 * Aggregated stats for the email tab.
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    const userId = sessionUser?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Subscribers
    const subsResult = await db.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE unsubscribed = FALSE) AS total_active,
        COUNT(*) FILTER (
          WHERE unsubscribed = FALSE
            AND created_at >= NOW() - INTERVAL '7 days'
        ) AS new_last_7
      FROM email_subscribers
      WHERE user_id = $1
      `,
      [userId]
    );
    const subsRow = subsResult.rows[0] || {};
    const totalSubscribers = parseInt(
      subsRow.total_active?.toString() || '0',
      10
    );
    const subscribersLast7Days = parseInt(
      subsRow.new_last_7?.toString() || '0',
      10
    );

    // Sends
    const sendsResult = await db.query(
      `
      SELECT
        COUNT(*)        AS total_emails_sent,
        MAX(sent_at)    AS last_send_at
      FROM email_sends
      WHERE user_id = $1
      `,
      [userId]
    );
    const sendsRow = sendsResult.rows[0] || {};
    const totalEmailsSent = parseInt(
      sendsRow.total_emails_sent?.toString() || '0',
      10
    );
    const lastSendAt = sendsRow.last_send_at || null;

    // Recent campaigns (limited)
    const campaignsResult = await db.query(
      `
      SELECT
        c.id,
        c.name,
        c.status,
        c.created_at,
        c.updated_at,
        COALESCE(MAX(es.sent_at), NULL)  AS last_sent_at,
        COALESCE(SUM(es.recipients), 0) AS total_recipients
      FROM email_campaigns c
      LEFT JOIN email_sends es
        ON es.campaign_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 5
      `,
      [userId]
    );

    // Go-live last sent
    const settingsResult = await db.query(
      `
      SELECT last_go_live_email_at
      FROM email_settings
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );
    const lastGoLiveEmailAt =
      settingsResult.rows[0]?.last_go_live_email_at || null;

    return res.json({
      ok: true,
      stats: {
        totalSubscribers,
        subscribersLast7Days,
        totalEmailsSent,
        lastSendAt,
        lastGoLiveEmailAt,
        recentCampaigns: campaignsResult.rows,
      },
    });
  } catch (err) {
    console.error('[emailApi] GET /stats failed:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

export default router;
