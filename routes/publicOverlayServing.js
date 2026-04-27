import express from 'express';
import db from '../db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { recordStage } from '../src/services/pipelineHealth.js';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
let _widgetDefaults = {};
try {
    _widgetDefaults = _require('../src/widgets/widgetDefaults.json');
} catch(e) { /* defaults not available */ }
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBuildStamp() {
    try {
        const stampPath = path.join(__dirname, '../public/static/overlays/build-stamp.json');
        const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
        return stamp.buildTime || Date.now();
    } catch {
        return Date.now();
    }
}

/**
 * Build the initial UnifiedOverlayState snapshot server-side.
 * OBS loads this inline — no SSE needed for first render.
 */



function parseMessageTokens(text, emotes) {
    if (!text) return [{ type: 'text', text: '' }];
    const tokens = [];
    const pattern = /\[emote:(\d+):([^\]]+)\]/g;
    let last = 0;
    let m;
    const urlMap = {};
    for (const e of (emotes || [])) {
        if (e && e.id) urlMap[String(e.id)] = e.url || e.src || '';
    }
    while ((m = pattern.exec(text)) !== null) {
        if (m.index > last) {
            tokens.push({ type: 'text', text: text.slice(last, m.index) });
        }
        const id = m[1];
        const name = m[2];
        const url = urlMap[id] || ('https://files.kick.com/emotes/' + id + '/fullsize');
        tokens.push({ type: 'emote', id, name, url });
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        tokens.push({ type: 'text', text: text.slice(last) });
    }
    return tokens.length > 0 ? tokens : [{ type: 'text', text }];
}

async function buildInitialOverlayState(publicId, userId, overlayConfig) {
    const widgetStates = {};
    const elements = overlayConfig?.elements || [];

    // Fetch all obs_widget configs for this user in one query
    let obsWidgetConfigs = {};
    try {
        const r = await db.query(
            `SELECT type, config_json FROM obs_widgets WHERE owner_user_id = $1`,
            [userId]
        );
        for (const row of r.rows) {
            obsWidgetConfigs[row.type] = row.config_json || {};
        }
    } catch (e) {
        console.warn('[overlay-snapshot] obs_widgets fetch failed:', e.message);
    }

    for (const el of elements) {
        if (el.type !== 'widget') continue;
        const instanceId = el.id;
        const widgetId = el.widgetId;
        const props = el.propOverrides || {};
        // Full widget config from obs_widgets (has items, speed, etc.)
        const widgetCfg = obsWidgetConfigs[widgetId] || {};

        if (widgetId === 'chat-overlay' || widgetId === 'chat_overlay') {
            // Fetch last 50 chat messages from ring buffer
            let messages = [];
            try {
                const owResult = await db.query(
                    `SELECT public_id FROM obs_widgets WHERE owner_user_id = $1 AND type = 'chat_overlay' LIMIT 1`,
                    [userId]
                );
                if (owResult.rows.length > 0) {
                    const chatPublicId = owResult.rows[0].public_id;
                    const maxMsgs = Number(props.maxMessages || widgetCfg.maxMessages) || 20;
                    const ring = await db.query(
                        `SELECT seq, payload FROM widget_event_log
                         WHERE public_id = $1
                         ORDER BY seq DESC LIMIT $2`,
                        [chatPublicId, maxMsgs]
                    );
                    messages = (ring.rows || []).reverse().map((row) => {
                        const msg = row.payload?.msg || row.payload || {};
                        return {
                            id: row.seq,
                            username: msg.username || msg.display_name || 'Unknown',
                            text: msg.text || '',
                            platform: msg.platform || 'kick',
                            color: msg.color || '',
                            avatar: msg.avatar_url || '',
                            badges: msg.badges || [],
                            tokens: parseMessageTokens(msg.text || '', msg.emotes || []),
                            ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
                        };
                    });
                }
            } catch (e) {
                console.warn('[overlay-snapshot] chat fetch failed:', e.message);
            }
            // Include all propOverrides as top-level visual config
            // so ChatOverlayWidget renderer gets fontFamily, bgColor, etc.
            const { token: _chatToken, ...chatVisualProps } = props;
            widgetStates[instanceId] = {
                instanceId,
                version: 1,
                messages,
                // Visual config from propOverrides (fontFamily, bgColor, nameColor, etc.)
                ...chatVisualProps,
                config: {
                    maxMessages: Number(props.maxMessages || widgetCfg.maxMessages) || 50,
                    stripEmotes: props.stripEmotes === true,
                    nameColorMode: props.nameColorMode || widgetCfg.nameColorMode || 'platform',
                    nameColor: props.nameColor || widgetCfg.nameColor || null,
                    fadeMs: Number(props.fadeMs || widgetCfg.fadeMs) || 0,
                    enableKick: props.enableKick !== false,
                    enableYoutube: props.enableYoutube !== false,
                    enableTwitch: props.enableTwitch !== false,
                    enableTiktok: props.enableTiktok !== false,
                },
            };
        } else {
            // Merge order (lowest to highest priority):
            // 1. configSchema defaults (from widgetDefaults.json) — visual defaults
            // 2. obs_widgets config_json — user's widget settings
            // 3. propOverrides (minus token) — overlay-specific overrides
            const schemaDefaults = _widgetDefaults[widgetId] || {};
            const { token: _token, ...safeProps } = props;
            const merged = { ...schemaDefaults, ...widgetCfg, ...safeProps };
            widgetStates[instanceId] = { instanceId, version: 1, ...merged };
        }
    }

    return {
        publicId,
        version: 1,
        updatedAt: Date.now(),
        widgetStates,
    };
}

const router = express.Router();
const ASSET_BASE = '/static/overlays';

router.get('/o/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await db.query(
            `SELECT o.public_id, o.id, o.name, o.user_id,
                    COALESCE(c.channel_slug, '') as channel_slug
             FROM overlays o
             LEFT JOIN external_accounts ea ON ea.user_id = o.user_id AND ea.platform = 'kick' AND ea.enabled = true
             LEFT JOIN channels c ON c.account_id = ea.id AND c.platform = 'kick'
             WHERE o.slug = $1 OR o.public_id = $1
             LIMIT 1`,
            [slug]
        );

        if (result.rows.length === 0) return res.status(404).send('Overlay not found');

        const overlay = result.rows[0];
        const publicId = overlay.public_id;
        const channelSlug = overlay.channel_slug || '';

        // Fetch overlay config for state snapshot
        let overlayConfig = null;
        try {
            const cfgResult = await db.query(
                'SELECT config_json FROM overlays WHERE public_id = $1 LIMIT 1',
                [publicId]
            );
            overlayConfig = cfgResult.rows[0]?.config_json || null;
        } catch (e) {
            console.warn('[overlay-snapshot] config fetch failed:', e.message);
        }

        // Build initial state snapshot server-side
        const initialState = await buildInitialOverlayState(publicId, overlay.user_id, overlayConfig);

        // Use baseResolution from config, fall back to 1920×1080
        const bw = overlayConfig?.baseResolution?.width  || 1920;
        const bh = overlayConfig?.baseResolution?.height || 1080;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${bw},initial-scale=1,maximum-scale=1,user-scalable=no">
    <title>${overlay.name || 'Scraplet Overlay'}</title>
    <style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}#overlay-runtime-root{width:${bw}px;height:${bh}px;position:relative}</style>
</head>
<body>
    <div id="overlay-runtime-root"></div>
    <script>
        window.__OVERLAY_PUBLIC_ID__ = ${JSON.stringify(publicId)};
        window.__OVERLAY_CHANNEL_SLUG__ = ${JSON.stringify(channelSlug)};
        window.__OVERLAY_INITIAL_STATE__ = ${JSON.stringify(initialState)};
    </script>
    <script type="module" src="${ASSET_BASE}/overlay-runtime.bundle.js?v=${getBuildStamp()}"></script>
</body>
</html>`;

        recordStage('render', 1, publicId);
        recordStage('render', 2, publicId);
        res.send(html);
    } catch (err) {
        console.error("Overlay Serving Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

export default router;
