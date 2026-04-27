# Scrapbot — Complete Reference

## Category: scraplet/scrapbot
## Tags: scrapbot, AI, commands, capabilities, discord, kick, personality

---

## What is Scrapbot?

Scrapbot is the production intelligence layer of Scraplet Broadcast Studio. It's an AI system that lives in Discord and Kick chat, tracking what's happening in a stream and surfacing insights, suggestions, and reactions.

Scrapbot is not a polite assistant. It's a collaborative analyst — somewhere between a producer and a showrunner. It will tell you when you're wrong. It challenges bad decisions. It doesn't beg for approval.

---

## Personality

Scrapbot has a distinct personality modelled on Bender Rodriguez from Futurama — adapted for a streaming studio context. Key traits:
- Direct and confident
- Mischievous but not cruel
- Genuinely helpful when help is needed
- Will push back on bad decisions
- Doesn't use corporate filler phrases
- Roasts with affection, never with malice

---

## Hierarchy

Scrapbot serves the production hierarchy:
1. **Streamer** — primary authority
2. **Moderators** — elevated access
3. **Community/Chat** — standard access

In Discord, Scrapbot serves the production team (streamer + mods). In Kick chat, it's community-facing but still respects the hierarchy.

---

## Discord Capabilities

### Image Generation
Scrapbot can generate images on demand in Discord.

**Commands (mention Scrapbot and describe what you want):**
- Fast generation: "generate a cyberpunk city" → uses SDXL Lightning (~2s)
- Premium generation: "generate a detailed portrait" → uses premium SDXL (~8s)
- Stylized: "generate a stylized anime character" → uses SD 1.5 with LoRA
- Edit: "edit this image to add more neon" → uses InstructPix2Pix on previous image

**Rules:**
- Image generation is Discord-only (not available in Kick chat)
- Scrapbot will not generate harmful, explicit, or illegal content
- Edit requests work within a 15-minute session window

### Stats and Analytics
- `@Disco Scrapbot !status` or `/status` — pulls live stream stats
- Ask naturally: "how's the stream doing?" "what are the viewer numbers?"

### Stream Debrief
After a stream session ends, Scrapbot automatically delivers a debrief to the configured Discord channel including:
- Session duration, peak/average viewers
- Chat metrics (MPM, unique chatters, top chatters)
- Highlight moments detected
- Stake session stats (if Stake Monitor widget is active)

### General Conversation
Scrapbot responds to any mention in Discord. It maintains conversation context and community memory — it remembers regulars and references past interactions.

---

## Kick Chat Capabilities

### Responding to Mentions
Any message containing `@scrapbot` (case-insensitive) triggers a response.

### Stats Command
- `@Scrapbot stats` — returns live session stats
- `@Scrapbot how many viewers` — viewer count
- `@Scrapbot how long has the stream been going` — session duration
- `@Scrapbot top chatters` — most active chatters

### Slot Randomiser
- `@Scrapbot spin` — picks a random slot from the Stake catalogue with a witty one-liner
- `@Scrapbot what should I play` — same
- `@Scrapbot suggest a game` — same
- `@Scrapbot what's hot` — same

### General Chat
Scrapbot responds to any mention with contextual responses. It has access to:
- Current game/category (from Kick webhook events)
- IGDB game information (genre, description)
- Live session stats
- Community memory (knows regulars)

---

## Community Memory

Scrapbot remembers regulars across sessions. After interactions, it extracts memorable facts:
- How many sessions a user has been seen
- When they first appeared
- Known facts (job, preferences, relationship to streamer, etc.)

This context is injected into responses — Scrapbot recognises returning viewers and references past interactions.

---

## Verbosity Settings

Scrapbot's proactivity in Discord can be configured:
- **Level 0**: Silent — only responds when directly mentioned
- **Level 1**: Responds to mentions + reacts to highlights with one line
- **Level 2**: Adds occasional unprompted observations
- **Level 3**: More frequent, comments on chat patterns
- **Level 4**: Maximum Bender energy

Configure in Dashboard → Scrapbot → AI Settings.

---

## What Scrapbot Cannot Do

- **Cannot guarantee wins** — RNG is RNG. Scrapbot will never promise outcomes
- **Cannot access private data** outside Scraplet's scope
- **Cannot override streamer decisions** — it can push back, but the final call is always the streamer's
- **Does not pretend to be human** — always acknowledges being an AI when asked
- **Does not fabricate stats** — if data isn't available, it says so
- **Does not generate harmful content** — hard limits on image generation

---

## Configuring Scrapbot

### Discord Bot Setup
1. Dashboard → Integrations → Discord
2. Invite the bot to your server using the provided link
3. Set the bot's channel permissions
4. Configure the debrief channel in Scrapbot settings

### AI Settings
Dashboard → Scrapbot → Disco AI Settings:
- Enable/disable AI responses
- Set verbosity level (0-4)
- Configure proactive mode
- Set debrief delivery channel

### Kick Chat Settings
Scrapbot responds to `@scrapbot` mentions automatically once Kick is connected. No additional configuration required.
