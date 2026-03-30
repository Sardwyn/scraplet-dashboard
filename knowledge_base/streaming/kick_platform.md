# Kick Platform Guide

## Category: streaming/kick
## Tags: kick, platform, streaming, setup, monetisation, growth, casino

---

## What is Kick?

Kick is a live streaming platform launched in 2023, backed by Stake.com. It positions itself as a creator-friendly alternative to Twitch with:
- 95/5 revenue split (streamers keep 95% of subscription revenue)
- More permissive content policies
- Algorithm that actively promotes new and smaller streamers
- Explicit support for gambling/casino content

---

## Getting Started on Kick

### Account Setup
1. Create account at kick.com
2. Complete identity verification (required for monetisation)
3. Set up your channel — banner, profile picture, bio, social links
4. Configure stream key in your streaming software (OBS)

### Stream Key
Settings → Stream → Copy stream key
In OBS: Settings → Stream → Service: Custom → Server: rtmp://fa723fc1b171.global-contribute.live-video.net/app → Stream Key: your key

### Channel Categories
Choose the right category — it affects discoverability:
- **Slots & Casino** — primary category for gambling content
- **Just Chatting** — variety/talk content
- **Gaming** — specific game categories

---

## Kick Features

### Subscriptions
- Available once you reach Kick Partner status
- Viewers subscribe for $4.99/month (or higher tiers)
- You keep 95% ($4.74 per sub)
- Subscribers get custom emotes, badge, ad-free viewing

### Clips
- Viewers and streamers can clip moments
- Clips are shareable and discoverable
- Good clips drive channel discovery

### Raids
- Send your viewers to another channel at stream end
- Command: `/raid [username]`
- Builds community relationships, often reciprocated

### Channel Points
- Not currently available on Kick (Twitch feature)
- Kick uses subscriptions and gifted subs as primary engagement mechanics

### Gifted Subscriptions
- Viewers can gift subscriptions to other viewers
- Creates community moments, good for content

---

## Kick Algorithm

Kick's algorithm is more favourable to new streamers than Twitch's:
- New streamers get more browse page exposure
- Category pages show a mix of large and small streamers
- Consistent streaming is rewarded with better placement
- Engagement metrics (chat activity, follows) boost visibility

**Key factors for algorithm performance:**
1. Consistent schedule
2. Active chat (MPM matters)
3. Follow rate (% of viewers who follow)
4. Stream duration (longer streams get more exposure)

---

## Kick Monetisation

### Revenue Streams
1. **Subscriptions** — requires Partner status
2. **Donations** — via third-party services (StreamElements, etc.)
3. **Gifted subs** — viewers gift to community
4. **Sponsorships** — direct deals with brands

### Partner Requirements
Kick's partner requirements are less strict than Twitch:
- Consistent streaming schedule
- Growing audience
- Community engagement
- Content quality

Apply through Dashboard → Monetisation → Apply for Partnership

---

## Kick and Gambling Content

Kick explicitly supports gambling/casino streaming. This is a key differentiator from Twitch, which has strict gambling restrictions.

**What's allowed:**
- Slot streaming
- Casino game streaming
- Bonus buy content
- Win/loss content

**Best practices for gambling content on Kick:**
- Add responsible gambling disclaimer to channel description
- Use the Slots & Casino category
- Engage with chat about game mechanics, not just outcomes
- Clip big wins for discoverability

---

## Connecting Kick to Scraplet

1. Dashboard → Integrations → Kick
2. Click "Connect Kick Account"
3. Authorise via OAuth
4. Scraplet will begin receiving your channel events

**What Scraplet receives from Kick:**
- Chat messages (forwarded to Scrapbot)
- Follow events
- Subscription events
- Raid events
- Stream start/end events
- Category/title changes

**Token Management:**
Kick OAuth tokens expire and need refreshing. Scraplet handles this automatically. If your Kick connection shows an error, re-authenticate from the integrations page.

---

## Common Kick Issues

### Stream Not Going Live
- Check stream key is correct in OBS
- Verify your internet connection
- Try a different Kick ingest server

### Chat Not Appearing in Scraplet
- Check Kick integration status in dashboard
- Re-authenticate if token shows error
- Verify Scrapbot has correct channel permissions

### Low Viewership
- Check you're in the right category
- Stream at consistent times
- Engage with every viewer who appears
- Raid other streamers at stream end
