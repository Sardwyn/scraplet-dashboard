// services/kickEvents.js

import KickClient from './kick/kickClient.js';




// All events we want Kick to send to our webhook
// services/kickEvents.js

const EVENTS_TO_SUBSCRIBE = [
  { name: "chat.message.sent", version: 1 },
  { name: "channel.followed", version: 1 },
  { name: "channel.subscription.renewal", version: 1 },
  { name: "channel.subscription.gifts", version: 1 },
  { name: "channel.subscription.new", version: 1 },
  { name: "channel.reward.redemption.updated", version: 1 },
  { name: "livestream.status.updated", version: 1 },
  { name: "livestream.metadata.updated", version: 1 },
  { name: "moderation.banned", version: 1 },
  { name: "kicks.gifted", version: 1 },
];



/**
 * Ensure the current dashboard user has event subscriptions
 * to our webhook (configured in Kick app as
 *   https://scraplet.store/api/webhook/kick
 * ).
 *
 * Kick EventSub POST schema (from docs.kick.com/events/subscribe-to-events):
 *   {
 *     "broadcaster_user_id": 123,
 *     "events": [{ "name": "chat.message.sent", "version": 1 }],
 *     "method": "webhook"
 *   }
 *
 * NOTE: Kick docs state "When using a user access token, this field will be
 * ignored and the broadcaster user ID will be inferred from the user access
 * token."  We still send it explicitly for correctness / future-proofing.
 */
export async function ensureChatEventsSubscriptionForUser(
  dashboardUserId,
  broadcasterUserId = null,
  accessToken = null
) {
  const label = '[kickEvents]';

  console.log(
    `${label} ensureChatEventsSubscriptionForUser called`,
    { dashboard_user_id: dashboardUserId, broadcaster_user_id: broadcasterUserId, has_token: !!accessToken }
  );

  if (!dashboardUserId) {
    throw new Error(
      'ensureChatEventsSubscriptionForUser: dashboardUserId is required'
    );
  }

  // If caller already has a fresh access token (e.g. from OAuth callback),
  // use it directly – avoids DB round-trip that could find stale data.
  let kick;
  if (accessToken) {
    kick = new KickClient({ userId: dashboardUserId, accessToken });
  } else {
    kick = await KickClient.forUser(dashboardUserId);
  }

  // Build subscription body per Kick EventSub schema:
  // broadcaster_user_id is top-level, not per-event.
  const body = {
    events: EVENTS_TO_SUBSCRIBE,
    method: 'webhook',
  };

  if (broadcasterUserId) {
    body.broadcaster_user_id = Number(broadcasterUserId);
  }

  console.log(
    `${label} subscribing events`,
    {
      dashboard_user_id: dashboardUserId,
      broadcaster_user_id: body.broadcaster_user_id || '(inferred from token)',
      event_count: body.events.length,
    }
  );

  // ── POST subscription ──────────────────────────────────────
  let subscribeResult;
  try {
    subscribeResult = await kick.api('/public/v1/events/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(
      `${label} POST /events/subscriptions FAILED`,
      {
        dashboard_user_id: dashboardUserId,
        broadcaster_user_id: body.broadcaster_user_id || null,
        error: err?.message || String(err),
      }
    );
    throw err;
  }

  // Log the POST response
  const subData = Array.isArray(subscribeResult?.data) ? subscribeResult.data : [];
  console.log(
    `${label} POST response`,
    {
      dashboard_user_id: dashboardUserId,
      broadcaster_user_id: body.broadcaster_user_id || null,
      message: subscribeResult?.message || null,
      subscription_count: subData.length,
      subscriptions: subData.slice(0, 5).map(s => ({
        name: s.name,
        subscription_id: s.subscription_id,
        error: s.error || null,
      })),
    }
  );

  // ── GET verification: confirm subscriptions exist ──────────
  try {
    const qp = broadcasterUserId
      ? `?broadcaster_user_id=${Number(broadcasterUserId)}`
      : '';
    const listResult = await kick.api(`/public/v1/events/subscriptions${qp}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const listData = Array.isArray(listResult?.data) ? listResult.data : [];
    const matchingBroadcaster = broadcasterUserId
      ? listData.filter(s => String(s.broadcaster_user_id) === String(broadcasterUserId))
      : listData;

    console.log(
      `${label} GET verification`,
      {
        dashboard_user_id: dashboardUserId,
        broadcaster_user_id: broadcasterUserId || '(all)',
        total_subscriptions: listData.length,
        matching_broadcaster: matchingBroadcaster.length,
        first_few: matchingBroadcaster.slice(0, 5).map(s => ({
          id: s.id,
          event: s.event,
          broadcaster_user_id: s.broadcaster_user_id,
          method: s.method,
        })),
      }
    );
  } catch (err) {
    // Verification failure is non-fatal — subscriptions may still have been created
    console.warn(
      `${label} GET verification failed (non-fatal)`,
      { dashboard_user_id: dashboardUserId, error: err?.message || String(err) }
    );
  }

  return subscribeResult;
}
