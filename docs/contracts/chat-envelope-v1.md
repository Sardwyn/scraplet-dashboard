# ChatEnvelopeV1 (v=1)

## Purpose
Canonical, platform-agnostic representation of a single chat message for Scrapbot ingestion.

Consumers (must work without platform-specific fields):
- Moderation engine
- Command router
- Telemetry/metrics
- Optional fanout/persistence

## Contract
Required fields:
- v: 1
- id: string
- ts: ISO-8601 string
- platform: "kick" | "youtube" | "twitch"
- scraplet_user_id: number (>0)
- channel.slug: string
- author.display: string (non-empty)
- author.role: "viewer" | "subscriber" | "member" | "mod" | "broadcaster" | "unknown"
- message.text: string
- flags.is_paid: boolean
- flags.is_command_candidate: boolean
- source.ingest: "ws" | "poll" | "api"
- source.adapter: "kick" | "youtube" | "twitch"
- source.supervisor_id: string

Optional fields:
- channel.platform_channel_id, channel.platform_channel_name
- author.username, author.platform_user_id, author.badges
- message.is_action, message.is_reply, message.reply_to_id
- source.received_ts
- platform_payload (structured)
- raw (debug only)

## Rules (non-negotiable)
- Consumers must not depend on `platform_payload` or `raw`.
- author.display must never be empty.
- message.text must always exist (string).
- Prefer native platform message IDs for `id`.
- If native id unavailable: derive a deterministic id from platform + channel + author + ts + text.

## Versioning
Breaking changes require v2 and dual-read support.
