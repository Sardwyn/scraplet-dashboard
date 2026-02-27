// src/alerts/engine.js
import db from "../../db.js";

/**
 * V2 Alerts Engine (enforcement)
 *
 * Responsibilities:
 * - Load active ruleset + rules for a user
 * - Match FIRST rule (priority DESC) whose conditions pass
 * - Enforce:
 *   - per-rule cooldown (alert_rules.cooldown_seconds)
 *   - global cooldown (actions_json.cooldowns.global_s)
 *   - burst protection (actions_json.queue.burst_max / burst_window_s)
 *   - dedupe window (alert_rules.dedupe_window_seconds) using alert_queue.dedupe_key
 * - Enqueue into public.alert_queue (or drop)
 *
 * Renderer expects resolved_json.alert.text.resolved (you already have that)
 */

function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toFloat(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStr(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s.length ? s : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJson(obj) {
  return JSON.stringify(obj ?? {});
}

/**
 * Very small token replacement (V2 can expand later)
 */
function renderTemplate(template, event) {
  const actor = event?.actor?.display || event?.actor?.username || "Someone";
  const msg = event?.message?.text || "";
  let out = String(template || "{actor.display} triggered an alert!");
  out = out.replaceAll("{actor.display}", actor);
  out = out.replaceAll("{message.text}", msg);
  return out;
}

/**
 * Extract numeric "amount" and "count" from event (best-effort).
 * Your inbound normalizer can set event.amount.value, event.amount.currency, event.count.
 */
function getEventAmount(event) {
  const v =
    toFloat(event?.amount?.value, null) ??
    toFloat(event?.meta?.amount, null) ??
    toFloat(event?.meta?.amount_value, null);

  const currency = asStr(event?.amount?.currency, "") || asStr(event?.meta?.currency, "") || null;

  return { value: v, currency };
}

function getEventCount(event) {
  return (
    toInt(event?.count, null) ??
    toInt(event?.meta?.count, null) ??
    toInt(event?.meta?.quantity, null)
  );
}

/**
 * Dedupe key strategy (simple + stable)
 * V2 can add configurable strategies later.
 */
function computeDedupeKey(rule, event) {
  const ownerType = asStr(event?.type, "unknown");
  const platform = asStr(event?.platform, "unknown");
  const actor = asStr(event?.actor?.display || event?.actor?.username, "anon");
  const msg = asStr(event?.message?.text, "");
  // Keep it short; dedupe_key column is text but no need to bloat it
  const msgHash = msg ? msg.slice(0, 60) : "";
  return `${platform}:${ownerType}:${actor}:${msgHash}`.slice(0, 240);
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

/**
 * Condition matcher
 * - event_types (existing rule column) is always enforced
 * - conditions_json: platforms, actor filter, amount thresholds, count thresholds
 */
function matchesRule(rule, event) {
  if (!rule?.enabled) return false;

  const type = asStr(event?.type, "");
  const eventTypes = Array.isArray(rule?.event_types) ? rule.event_types : [];
  if (type && eventTypes.length && !eventTypes.includes(type)) return false;

  const c = rule?.conditions_json || {};

  // platform filter
  const platforms = normalizeArray(c?.platforms).map(s => String(s).trim()).filter(Boolean);
  if (platforms.length) {
    const p = asStr(event?.platform, "");
    if (!p || !platforms.includes(p)) return false;
  }

  // actor filter
  const actorMode = asStr(c?.actor?.mode, "any"); // any|equals|contains
  const actorValue = asStr(c?.actor?.value, "");
  if (actorMode !== "any" && actorValue) {
    const actor = asStr(event?.actor?.display || event?.actor?.username, "");
    const a = actor.toLowerCase();
    const v = actorValue.toLowerCase();
    if (actorMode === "equals" && a !== v) return false;
    if (actorMode === "contains" && !a.includes(v)) return false;
  }

  // amount thresholds
  const { value: amtVal } = getEventAmount(event);
  const minAmt = (c?.amount?.min === null || c?.amount?.min === undefined) ? null : toFloat(c.amount.min, null);
  const maxAmt = (c?.amount?.max === null || c?.amount?.max === undefined) ? null : toFloat(c.amount.max, null);
  if (minAmt !== null || maxAmt !== null) {
    if (amtVal === null) return false; // if you set thresholds, event must have amount
    if (minAmt !== null && amtVal < minAmt) return false;
    if (maxAmt !== null && amtVal > maxAmt) return false;
  }

  // count thresholds
  const countVal = getEventCount(event);
  const minCount = (c?.count?.min === null || c?.count?.min === undefined) ? null : toInt(c.count.min, null);
  const maxCount = (c?.count?.max === null || c?.count?.max === undefined) ? null : toInt(c.count.max, null);
  if (minCount !== null || maxCount !== null) {
    if (countVal === null) return false;
    if (minCount !== null && countVal < minCount) return false;
    if (maxCount !== null && countVal > maxCount) return false;
  }

  // advanced_json is stored only; not enforced yet (intentional)
  return true;
}

/**
 * Cooldown + burst enforcement based on alert_queue history.
 * We intentionally enforce using DB time (NOW()).
 */
async function isWithinGlobalCooldown(ownerUserId, globalSeconds) {
  const s = toInt(globalSeconds, 0) || 0;
  if (s <= 0) return false;

  const { rows } = await db.query(
    `
    SELECT 1
    FROM public.alert_queue
    WHERE owner_user_id = $1
      AND (
        (sent_at IS NOT NULL AND sent_at > (NOW() - ($2::int * INTERVAL '1 second')))
        OR
        (created_at IS NOT NULL AND created_at > (NOW() - ($2::int * INTERVAL '1 second')) AND status IN ('queued','sent','started'))
      )
    LIMIT 1
    `,
    [ownerUserId, s]
  );

  return !!rows[0];
}

async function isWithinRuleCooldown(ownerUserId, ruleId, ruleSeconds) {
  const s = toInt(ruleSeconds, 0) || 0;
  if (s <= 0) return false;

  const { rows } = await db.query(
    `
    SELECT 1
    FROM public.alert_queue
    WHERE owner_user_id = $1
      AND rule_id = $2
      AND (
        (sent_at IS NOT NULL AND sent_at > (NOW() - ($3::int * INTERVAL '1 second')))
        OR
        (created_at IS NOT NULL AND created_at > (NOW() - ($3::int * INTERVAL '1 second')) AND status IN ('queued','sent','started'))
      )
    LIMIT 1
    `,
    [ownerUserId, ruleId, s]
  );

  return !!rows[0];
}

async function isBurstLimited(ownerUserId, burstMax, burstWindowSeconds) {
  const max = Math.max(1, toInt(burstMax, 5) || 5);
  const win = Math.max(1, toInt(burstWindowSeconds, 10) || 10);

  const { rows } = await db.query(
    `
    SELECT COUNT(*)::int AS c
    FROM public.alert_queue
    WHERE owner_user_id = $1
      AND created_at > (NOW() - ($2::int * INTERVAL '1 second'))
      AND status IN ('queued','sent','started')
    `,
    [ownerUserId, win]
  );

  const c = rows[0]?.c ?? 0;
  return c >= max;
}

async function isDeduped(ownerUserId, dedupeKey, windowSeconds) {
  const w = Math.max(0, toInt(windowSeconds, 0) || 0);
  if (!dedupeKey || w <= 0) return false;

  const { rows } = await db.query(
    `
    SELECT 1
    FROM public.alert_queue
    WHERE owner_user_id = $1
      AND dedupe_key = $2
      AND created_at > (NOW() - ($3::int * INTERVAL '1 second'))
      AND status IN ('queued','sent','started')
    LIMIT 1
    `,
    [ownerUserId, dedupeKey, w]
  );

  return !!rows[0];
}

function buildResolved(rule, event) {
  const text = renderTemplate(rule?.text_template, event);

  const resolved = {
    v: 1,
    event,
    alert: {
      name: asStr(rule?.name, "Alert"),
      duration_ms: toInt(rule?.duration_ms, 6500) || 6500,
      text: {
        template: asStr(rule?.text_template, "{actor.display} triggered an alert!"),
        resolved: text,
      },
      visual: rule?.visual_json || {},
      audio: rule?.audio_json || {},
    },
  };

  return resolved;
}

async function loadRulesetAndRules(ownerUserId) {
  // Active ruleset: V1 = one per user; V2 will expand later
  const { rows: rsRows } = await db.query(
    `
    SELECT id
    FROM public.alert_rulesets
    WHERE owner_user_id = $1
    ORDER BY is_active DESC, created_at ASC
    LIMIT 1
    `,
    [ownerUserId]
  );

  const rulesetId = rsRows[0]?.id || null;
  if (!rulesetId) return { rulesetId: null, rules: [] };

  const { rows: rules } = await db.query(
    `
    SELECT *
    FROM public.alert_rules
    WHERE ruleset_id = $1
      AND enabled = true
    ORDER BY priority DESC, created_at ASC
    `,
    [rulesetId]
  );

  return { rulesetId, rules: rules || [] };
}

/**
 * Main entry: match + enforce + enqueue
 */
export async function enqueueAlertForUserEvent(ownerUserId, event, opts = {}) {
  const userId = toInt(ownerUserId, null);
  if (!userId) return { ok: false, reason: "bad_owner_user_id" };

  const { rules } = await loadRulesetAndRules(userId);
  if (!rules.length) return { ok: false, reason: "no_rules" };

  // Find first match (first-match-wins)
  const matched = rules.find(r => matchesRule(r, event));
  if (!matched) return { ok: false, reason: "no_match" };

  const actions = matched.actions_json || {};
  const queueMode = asStr(actions?.queue?.mode, "stack"); // stack|drop|merge (merge treated like drop for now)
  const burstMax = toInt(actions?.queue?.burst_max, 5) || 5;
  const burstWindow = toInt(actions?.queue?.burst_window_s, 10) || 10;
  const globalCooldown = toInt(actions?.cooldowns?.global_s, 0) || 0;

  // Global cooldown
  if (!opts?.ignoreCooldowns) {
    const inGlobal = await isWithinGlobalCooldown(userId, globalCooldown);
    if (inGlobal) return { ok: false, reason: "global_cooldown" };
  }

  // Rule cooldown
  if (!opts?.ignoreCooldowns) {
    const inRule = await isWithinRuleCooldown(userId, matched.id, matched.cooldown_seconds);
    if (inRule) return { ok: false, reason: "rule_cooldown", rule_id: matched.id };
  }

  // Burst limit
  if (!opts?.ignoreBurst) {
    const burstLimited = await isBurstLimited(userId, burstMax, burstWindow);
    if (burstLimited) {
      if (queueMode === "stack") {
        // allow stacking even under burst if user chooses stack (still prevents infinite spam via cooldown/dedupe)
      } else {
        // drop/merge (merge treated as drop in V2.0)
        return { ok: false, reason: "burst_limited", mode: queueMode };
      }
    }
  }

  // Dedupe
  const dedupeKey = computeDedupeKey(matched, event);
  const deduped = await isDeduped(userId, dedupeKey, matched.dedupe_window_seconds);
  if (deduped) return { ok: false, reason: "deduped", dedupe_key: dedupeKey };

  const resolved = buildResolved(matched, event);

  // Enqueue
  const { rows } = await db.query(
    `
    INSERT INTO public.alert_queue
      (owner_user_id, status, priority, available_at, event_json, resolved_json, rule_id, dedupe_key)
    VALUES
      ($1, 'queued', $2, NOW(), $3::jsonb, $4::jsonb, $5, $6)
    RETURNING id, status, created_at
    `,
    [userId, toInt(matched.priority, 50) || 50, safeJson(event), safeJson(resolved), matched.id, dedupeKey]
  );

  return { ok: true, rule_id: matched.id, enqueued: rows[0] };
}
