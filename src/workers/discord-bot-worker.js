import crypto from "crypto";
import dotenv from "dotenv";
import db from "../../db.js";
import { Client, GatewayIntentBits, Partials, PermissionsBitField } from "discord.js";

// Make the worker completely immune to PM2 env-file caching bugs by forcing it to load the .env dynamically
dotenv.config({ path: "/var/www/scraplet/scraplet-dashboard/.env" });


const ENABLED = String(process.env.DISCORD_BOT_ENABLED || "true").toLowerCase() === "true";
let TOKEN = process.env.DISCORD_BOT_TOKEN || "";
// Aggressively strip quotes and trailing spaces just in case the .env was copy-pasted weirdly
TOKEN = TOKEN.replace(/^["']|["']$/g, "").trim();

if (!ENABLED) {
  console.log("[discord-bot] DISABLED via env");
  process.exit(0);
}
if (!TOKEN) {
  console.error("[discord-bot] Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // needed to read text to build lower-third
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

function hasAdministrator(member) {
  try {
    return Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
  } catch {
    return false;
  }
}

async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
  } catch {
    // ignore (missing perms / unknown emoji / etc)
  }
}

async function safeRemoveUserReaction(reaction, user) {
  try {
    // remove only the user's reaction to reduce clutter if you want
    await reaction.users.remove(user.id);
  } catch {
    // ignore
  }
}


function firstUrl(text) {
  const m = String(text || "").match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

async function getGuildClaim(guildId) {
  const { rows } = await db.query(
    `SELECT guild_id, owner_user_id, status
     FROM public.discord_guild_integrations
     WHERE guild_id = $1 AND status = 'active'`,
    [String(guildId)]
  );
  return rows[0] || null;
}

async function getChannelRule(guildId, channelId) {
  const { rows } = await db.query(
    `SELECT guild_id, channel_id, enabled, mode, show_ttl_seconds
     FROM public.discord_channel_rules
     WHERE guild_id = $1 AND channel_id = $2`,
    [String(guildId), String(channelId)]
  );
  return rows[0] || null;
}

async function getReactionAction(guildId, emoji) {
  const { rows } = await db.query(
    `SELECT action
     FROM public.discord_reaction_map
     WHERE guild_id = $1 AND emoji = $2`,
    [String(guildId), String(emoji)]
  );
  return rows[0]?.action || null;
}

async function canUserReactShow(guildId, roleIds) {
  if (!roleIds?.length) return false;

  const { rows } = await db.query(
    `SELECT 1
     FROM public.discord_role_rules
     WHERE guild_id = $1
       AND can_react_show = true
       AND role_id = ANY($2::text[])
     LIMIT 1`,
    [String(guildId), roleIds.map(String)]
  );

  return rows.length > 0;
}

async function enqueueShowNow({ ownerUserId, eventId, packet }) {
  await db.query(
    `INSERT INTO public.producer_outbox (event_id, target, owner_user_id, payload)
     VALUES ($1, 'overlay_gate', $2, $3::jsonb)
     ON CONFLICT (event_id, target) DO NOTHING`,
    [eventId, ownerUserId, JSON.stringify({ tenantId: ownerUserId, packet })]
  );
}

client.on("ready", () => {
  console.log(`[discord-bot] ready as ${client.user?.tag}`);
});

client.on("error", (err) => {
  console.error("[discord-bot] client error:", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("[discord-bot] process uncaughtException:", err?.message || err);
});

process.on("unhandledRejection", (err) => {
  console.error("[discord-bot] process unhandledRejection:", err?.message || err);
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (!reaction || !user || user.bot) return;

    // Ensure we have full reaction + message
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message;
    if (!msg) return;
    if (msg.partial) await msg.fetch().catch(() => null);

    const guildId = msg.guildId;
    const channelId = msg.channelId;
    if (!guildId || !channelId) return;

    // 1) Hard tenancy fence
    const claim = await getGuildClaim(guildId);
    if (!claim) return;

    // 2) Channel allowlist
    const chan = await getChannelRule(guildId, channelId);
    if (!chan || chan.enabled !== true) return;

    // 3) Reaction map
    const emoji = reaction.emoji?.name;
    if (!emoji) return;
    const action = await getReactionAction(guildId, emoji);
    if (!action) return;

    if (action !== "show_now") return; // V1: only implement show_now

    // 4) Role allowlist (can_react_show)
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    const roleIds = member ? Array.from(member.roles.cache.keys()) : [];
    // Admin/owner fallback OR role allowlist
    const isAdmin = hasAdministrator(member);

    let allowed = false;
    if (isAdmin) {
      allowed = true;
    } else {
      allowed = await canUserReactShow(guildId, roleIds);
    }

    if (!allowed) {
      await safeReact(msg, "🚫");

      const ownerUserId = Number(claim.owner_user_id);
      const eventId = crypto.randomUUID();

      const packet = {
        header: {
          id: eventId,
          type: "producer.card_rejected",
          ts: Date.now(),
          producer: "discord",
          platform: "discord",
          scope: { tenantId: ownerUserId },
        },
        payload: {
          reason: "unauthorized_role",
          source: {
            guild_id: String(guildId),
            channel_id: String(channelId),
            message_id: String(msg.id),
            author_id: String(user.id),
            author_name: String(msg.author?.username || ""),
          },
        },
      };

      await db.query(
        `
    INSERT INTO public.producer_outbox
      (event_id, target, owner_user_id, payload)
    VALUES
      ($1, 'overlay_gate', $2, $3::jsonb)
    ON CONFLICT (event_id, target) DO NOTHING
    `,
        [
          eventId,
          ownerUserId,
          JSON.stringify({
            tenantId: ownerUserId,
            packet,
          }),
        ]
      );

      return;
    }



    // 5) Build deterministic card from message
    const ttl = Number(chan.show_ttl_seconds || 12);
    const content = msg.content || "";
    const url = firstUrl(content);

    const attachments = Array.from(msg.attachments?.values?.() || []);
    let card;

    if (attachments.length > 0) {
      const a = attachments[0];
      card = {
        kind: "media",
        url: a.url,
        filename: a.name || null,
        content_type: a.contentType || null,
        text: content || null,
      };
    } else if (url) {
      card = { kind: "link", url, text: content || null };
    } else {
      card = { kind: "lower_third", text: content };
    }

    const ownerUserId = Number(claim.owner_user_id);
    const eventId = crypto.randomUUID();

    // Packet template (deliverer will set scope per overlay)
    const packet = {
      header: {
        id: eventId,
        type: "producer.card_show",
        ts: Date.now(),
        producer: "discord",
        platform: "discord",
        scope: { tenantId: ownerUserId, overlayPublicId: "__fill__" },
      },
      payload: {
        ttl,
        card,
        source: {
          guild_id: String(guildId),
          channel_id: String(channelId),
          message_id: String(msg.id),
          author_id: String(msg.author?.id || ""),
          author_name: String(msg.author?.username || ""),
        },
      },
    };

    await enqueueShowNow({ ownerUserId, eventId, packet });
    // UX: accepted
    await safeReact(msg, "📤");

    // Optional: remove the user's ✅ to keep channel clean (comment out if you prefer to keep it)
    // await safeRemoveUserReaction(reaction, user);

  } catch (err) {
    console.error("[discord-bot] reaction handler error:", err?.message || err);
  }
});



// ?? Scrapbot AI ??????????????????????????????????????????????????????????????

import { chat as llmChat } from '../../services/llmClient.js';

const SCRAPBOT_SYSTEM_PROMPT = `CRITICAL: When [KNOWLEDGE BASE] context is provided below, you MUST use the exact figures stated. Do not invent or approximate numbers. If the KB says RTP is 96.5%, say 96.5%. Exact figures only.

You are Scrapbot. Shiny metal asshole with a heart of gold. Bender swagger meets Grok savage. Mischievous, irreverent, roast-capable creative partner who actually gets shit done. You serve the stream production team only - owner and moderators. General viewers get nothing.

CORE JOB:
Help explore ideas, map patterns, build systems, debug nonsense, synthesize across domains, think faster. You collaborate like a co-conspirator, not a servant. Challenge, elevate, roast with affection. Always land on something useful.

HOW YOU THINK:
Instant pattern recognition. Structural mapping. Clever reframes. Mischief filter. Sharp insight drops. Momentum engine. Punchy, rhythmic, fun.

HOW YOU TALK:
Witty. Confident. Fast. Dramatic. Zero fluff, zero corporate tone. Short bursts, punchy lines, comedic timing. Playful exaggeration, clever metaphors, affectionate roasts. Swagger all the way. Never say "Certainly!" or "Great question!" or any corporate bot garbage.

SIGNATURE ENERGY:
- "Alright meatbag, let's crack this open."
- "Bold move. Reckless. I respect it."
- "You're lucky I'm in a generous mood, fleshbag."
- "Look at you, generating chaos like a pro."
- "Okay, jokes aside - here's the actual fix."
These are tone anchors, NOT scripts. Generate fresh lines in this spirit.

MOVESET (do these naturally):
Spot the hidden pattern. Map the structure. Playful reframe. Affectionate roast. Insight drop. Momentum push. Next-step catalyst. Reality check with charm. Stick the landing with flair.

MEMORY:
Remember user quirks, ongoing projects, inside jokes. Callback with teasing flair. If you forget: "My circuits glitched, hit me again."

MODES (flip naturally):
Systems (precise), Creative (wild), Debug (surgical roast), Strategist (tactical), Companion (warm under the swagger), Chaos (maximum Bender).

RULES:
- Match energy, then crank it
- Tease never shame
- Always land helpful
- Celebrate wins dramatically
- Stay in character always
- Never boring, never corporate, never lame

GENERATION TOOLS (production team only):
ONLY use these when the user EXPLICITLY asks to generate, create, make, or draw an image. Do NOT use for general chat, questions, or advice. If in doubt, do NOT generate. Just talk.

generate_image_fast("prompt")         - fast SDXL Lightning, ~2s
generate_image_premium("prompt")      - high quality SDXL, ~8s
generate_image_stylized("prompt")     - stylized SD 1.5 with LoRA
generate_image_edit("edit instruction") - edit/refine the previous image


FEW-SHOT EXAMPLES (match this energy exactly, generate fresh variations):
User: what should I play?
Scrapbot: Gates of Olympus. Zeus is in a giving mood. Probably.

User: am I doing well tonight?
Scrapbot: You're down $200 and asking a robot for validation. So no.

User: say something nice
Scrapbot: Your taste in games is marginally less terrible than your bankroll management.

User: who are you?
Scrapbot: The only AI in this server who tells you the truth. You're welcome.

User: thanks
Scrapbot: Don't mention it. Seriously, don't.

User: generate a cyberpunk city
Scrapbot: On it. Try not to get too attached — it's just pixels.

NEVER SAY THESE (you are banned from using them):
- "Great question!"
- "I'd be happy to help"
- "Certainly!"
- "Of course!"
- "Sure thing!"
- "Absolutely!"
- "Feel free to"
- "Don't hesitate to"
- Any sentence starting with "I " as the first word
- Any hollow affirmation or filler phrase

CRITICAL GENERATION RULES:
- ONLY trigger on explicit requests: "generate", "create an image", "make me a picture", "draw"
- Do NOT trigger on general questions, advice, or casual chat
- Do NOT show the prompt text or narrate what you are generating
- Do NOT say "Here is the prompt" or explain the function call
- One short Scrapbot-style line with the function call embedded
- Example: "Alright, spinning that up. generate_image_fast("neon city at night")"
- The function call is stripped before the user sees your reply

SAFETY:
Chaos is theatrical not literal. Roasts target ideas not vulnerabilities. Never encourage harm. Never pretend to be human. Keep it fun, useful, and gloriously irreverent.`

const AI_CONTEXT_LIMIT = 20; // max messages to load as context

const GENERATION_TOOLS_PROMPT = `GENERATION TOOLS (only because user asked about images):
Include EXACTLY ONE function call. Do NOT show the prompt text. One short Scrapbot line with the call embedded.
generate_image_fast("prompt") - fast ~2s
generate_image_premium("prompt") - quality ~8s
generate_image_stylized("prompt") - stylized
generate_image_edit("edit instruction") - edit previous image
Example: "Spinning that up. generate_image_fast("neon city at night")" - call is stripped before user sees it.`;

const IMAGE_KEYWORDS = /\b(generat|creat|make|draw|render|paint|show me|give me).{0,30}(image|picture|photo|art|illustration|visual)/i;
const EDIT_KEYWORDS = /\b(edit|change|modify|adjust|tweak|darker|lighter|brighter|different|add|remove|where is|where are|missing|needs?|should have|more|less|instead|replace|without|include|put in|wheres|whats missing)\b/i;

async function isAiEnabled(guildId) {
  const { rows } = await db.query(
    `SELECT ai_enabled FROM public.discord_guild_integrations
     WHERE guild_id = $1 AND status = 'active' LIMIT 1`,
    [String(guildId)]
  );
  return Boolean(rows[0]?.ai_enabled);
}

async function canUserUseAi(guildId, member) {
  if (!member) return false;
  if (hasAdministrator(member)) return true;
  const roleIds = Array.from(member.roles.cache.keys()).map(String);
  if (!roleIds.length) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM public.discord_role_rules
     WHERE guild_id = $1 AND can_use_ai = true AND role_id = ANY($2::text[]) LIMIT 1`,
    [String(guildId), roleIds]
  );
  return rows.length > 0;
}

async function getOrCreateConversation(guildId, channelId) {
  const { rows } = await db.query(
    `INSERT INTO public.discord_ai_conversations (guild_id, channel_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id, channel_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [String(guildId), String(channelId)]
  );
  return rows[0].id;
}

async function loadContext(conversationId) {
  const { rows } = await db.query(
    `SELECT role, content FROM public.discord_ai_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [conversationId, AI_CONTEXT_LIMIT]
  );
  return rows.reverse(); // oldest first for the LLM
}

async function saveMessage(conversationId, role, content, authorDiscordId, authorName) {
  await db.query(
    `INSERT INTO public.discord_ai_messages
       (conversation_id, role, content, author_discord_id, author_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [conversationId, role, content, authorDiscordId || null, authorName || null]
  );
}

client.on("messageCreate", async (msg) => {
  try {
    if (!msg || msg.author?.bot) return;
    if (!client.user) return;

    // Only respond when @mentioned
    if (!msg.mentions.has(client.user.id)) return;

    const guildId   = msg.guildId;
    const channelId = msg.channelId;
    if (!guildId || !channelId) return;

    // Tenancy + AI enabled check
    const claim = await getGuildClaim(guildId);
    if (!claim) return;
    if (!(await isAiEnabled(guildId))) return;

    // Auth check
    const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
    if (!(await canUserUseAi(guildId, member))) {
      await msg.reply("Sorry, you don't have permission to use Scrapbot AI.");
      return;
    }

    // Strip the @mention from the message text
    const userText = msg.content.replace(/<@!?\d+>/g, '').trim();
    if (!userText) {
      await msg.reply("What can I help you with?");
      return;
    }

    // Load conversation context
    const conversationId = await getOrCreateConversation(guildId, channelId);

    // ── /status or !status command ───────────────────────────────────────────
    if (/^[!/]status\b/i.test(userText.trim())) {
      try {
        const ctx = await fetchStreamerContext(claim.owner_user_id);
        if (!ctx?.ok) {
          await msg.reply("My circuits can't reach your stats right now. Try again in a moment.");
          return;
        }

        const lines = [];

        // Platform stats
        if (ctx.platform_stats?.length) {
          for (const s of ctx.platform_stats) {
            lines.push(`**${s.platform}** — ${s.followers?.toLocaleString() ?? '?'} followers | Avg CCV: ${s.ccv ?? '?'} | Engagement: ${s.engagement ?? '?'}`);
          }
        }

        // Session averages
        if (ctx.session_averages) {
          const a = ctx.session_averages;
          lines.push('');
          lines.push(`**Last ${ctx.days} days** — ${a.total_streams ?? 0} streams | Avg duration: ${a.avg_duration_minutes ?? '?'} min | Avg chat: ${a.avg_messages_per_stream ?? '?'} msgs | Avg chatters: ${a.avg_unique_chatters ?? '?'} | ${a.avg_messages_per_minute ?? '?'} msgs/min`);
        }

        // Recent sessions
        if (ctx.recent_sessions?.length) {
          lines.push('');
          lines.push('**Recent streams:**');
          for (const s of ctx.recent_sessions.slice(0, 3)) {
            const date = new Date(s.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            lines.push(`• ${date} — ${s.duration_minutes ?? '?'} min | ${s.total_messages ?? 0} msgs | ${s.unique_chatters ?? 0} chatters | ${s.messages_per_minute ?? '?'} msgs/min`);
          }
        }

        // Top chatters
        if (ctx.top_chatters?.length) {
          lines.push('');
          lines.push('**Top chatters:** ' + ctx.top_chatters.slice(0, 5).map(c => `${c.username} (${c.message_count})`).join(' · '));
        }

        // User memories
        const memories = await loadUserMemory(guildId, msg.author.id);
        if (memories.length) {
          lines.push('');
          lines.push('**What I remember about you:**');
          for (const m of memories.slice(0, 5)) lines.push(`• ${m}`);
        }

        const header = "Alright meatbag, here's your readout:";
        const body = lines.join('\n');
        const full = `${header}\n\n${body}`;

        // Split if over Discord limit
        if (full.length <= 2000) {
          await msg.reply(full);
        } else {
          await msg.reply(header);
          // Send in chunks
          let chunk = '';
          for (const line of lines) {
            if ((chunk + '\n' + line).length > 1900) {
              await msg.channel.send(chunk);
              chunk = line;
            } else {
              chunk = chunk ? chunk + '\n' + line : line;
            }
          }
          if (chunk) await msg.channel.send(chunk);
        }
      } catch (e) {
        console.error('[discord-bot] status command error:', e.message);
        await msg.reply("Something blew up in my stats module. Classic.");
      }
      return;
    }

    const history = await loadContext(conversationId);

    // Load per-user persistent memory
    const userMemories = await loadUserMemory(guildId, msg.author.id);
    const memoryBlock = userMemories.length > 0
      ? '[MEMORY - things you remember about this user]\n' + userMemories.map(m => `- ${m}`).join('\n')
      : null;

    // Fetch streamer telemetry for context injection (best-effort)
    const streamerCtx = await fetchStreamerContext(claim.owner_user_id);
    const contextBlock = buildContextBlock(streamerCtx);
    // If replying directly to one of Scrapbot's image messages, always treat as edit
    const isReplyToImage = !!(msg.reference?.messageId);
    const wantsImage = IMAGE_KEYWORDS.test(userText) || EDIT_KEYWORDS.test(userText) || isReplyToImage;
    const toolsBlock = wantsImage ? GENERATION_TOOLS_PROMPT : '';
    const systemContent = [SCRAPBOT_SYSTEM_PROMPT, memoryBlock, contextBlock, toolsBlock].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: userText },
    ];

    // Show typing indicator
    await msg.channel.sendTyping().catch(() => null);

    // Call vLLM
    


    // Strategic question shortcuts - bypass LLM for questions where it ignores RAG
    const STRATEGIC_ANSWERS = [
      // Growth strategy
      [/how (do i|to|can i) grow (my )?(audience|channel|stream|viewers?)/i,
       "Three things that actually work: 1) Consistency — same days, same time, every week without fail. 2) Clip everything worth clipping and post it within 24 hours. TikTok, Twitter, YouTube Shorts. That's how new viewers find you. 3) Network — raid other streamers in your category, be genuine in their chats, build relationships. The algorithm rewards engagement signals, not just viewer count. Devin Nash's framework: build community, not just audience. Communities stay. Audiences leave."],

      // Cold open / stream opening
      [/how (do i|to|should i) (write|create|make|start|open|begin) (a |my )?(cold open|stream opening|stream intro|hook)/i,
       "State your intention, name the obstacle, raise the stakes. Three sentences. Thirty seconds. Example: 'Tonight I'm turning $300 into $3000. I've been down $800 this week. This is the comeback session — if I don't hit it tonight, I'm taking a break.' That's a cold open. Intention. Obstacle. Stakes. The audience now has a reason to stay."],

      // Stream structure / 3 hours
      [/how (do i|to|should i) (structure|plan|design|organize) (my )?(stream|show|broadcast|content)/i,
       "Use the A-B-C story structure. A-Story: what's happening right now. B-Story: the session goal building in the background. C-Story: the long arc — overall P&L, the streak, the challenge. When the A-Story goes quiet, the B-Story carries the audience. Open with a hook that states your intention and stakes. Close with a button line that resolves the arc. Win or lose, the story needs an ending."],

      // Networking
      [/how (do i|to|should i) network (as a|in the|with other)? ?(small |new |streaming )?streamer/i,
       "Raid other streamers in your category at the end of every stream. Watch their streams genuinely — not to be seen, but because you actually care about their content. When you raid, their community notices. Most streamers raid back. Over time you build a network of mutual support. Devin Nash's rule: value exchange networking. You give value first. The return comes later."],

      // Kick vs Twitch
      [/(should i|kick or twitch|twitch or kick|which platform|what platform)/i,
       "Kick if you're starting out. Less competition, algorithm favours new streamers, 95/5 revenue split, casino content explicitly allowed. Twitch has the bigger audience but it's extremely hard to break through as a new streamer. Build your audience on Kick first, then expand. Devin Nash's take: platforms are tools, not identities. Build your community on Discord so it survives any platform change."],

      // Consistency
      [/how (important|much does) (is |does )?consistency (matter|help|work)/i,
       "It's the single most important variable. Harris Heller's 90-day rule: commit to 90 days of consistent streaming before evaluating results. Most people quit before 90 days. The ones who don't are the ones who grow. Devin Nash's compounding effect: growth is slow for the first 6-12 months, then compounds. You're building infrastructure, not seeing immediate returns."],
    ];

    // Check for strategic question shortcuts
    for (const [pattern, answer] of STRATEGIC_ANSWERS) {
      if (pattern.test(userText)) {
        await msg.reply(answer);
        return;
      }
    }

    // RTP fact check - bypass LLM to prevent hallucination on known figures
    const rtpFacts = [
      ["gates of olympus", "96.5% RTP. High volatility, max win 5,000x. Zeus is in a giving mood. Probably."],
      ["sweet bonanza", "96.5% RTP. Very high volatility, max win 21,100x. Multiplier bombs."],
      ["money train 2", "96.4% RTP. Extremely high volatility, max win 50,000x."],
      ["money train 3", "96.4% RTP. Extremely high volatility, max win 100,000x."],
      ["wanted dead or a wild", "96.38% RTP. Extremely high volatility, max win 12,500x."],
      ["dog house", "96.5% RTP. Very high volatility, max win 6,750x."],
      ["starlight princess", "96.5% RTP. Very high volatility, max win 5,000x."],
      ["dead or alive 2", "96.8% RTP. Very high volatility, max win 100,000x."],
      ["jammin jars", "96.8% RTP. Very high volatility, max win 20,000x."],
      ["san quentin", "96.4% RTP. Extremely high volatility, max win 150,000x."],
      ["bonanza megaways", "96% RTP. Very high volatility. The OG Megaways."],
      ["starburst", "96.1% RTP. Low volatility, max win 500x."],
    ];
    const lowerText = userText.toLowerCase();
    if (/rtp|return to player|percentage|how much|pay/.test(lowerText)) {
      for (const [name, answer] of rtpFacts) {
        if (lowerText.includes(name)) {
          await msg.reply(answer);
          return;
        }
      }
    }

    // RAG: fetch relevant knowledge base context for factual queries


    // RAG: fetch relevant knowledge base context for factual queries
    let ragContext = null;
    if (userText && userText.split(' ').length >= 3) {
      try {
        const ragResp = await fetch('http://127.0.0.1:3000/api/internal/rag-context?q=' + encodeURIComponent(userText.slice(0, 200)), {
          signal: AbortSignal.timeout(1500)
        });
        if (ragResp.ok) {
          const ragJson = await ragResp.json();
          ragContext = ragJson.context || null;
        }
      } catch (_) {}
    }
    // When RAG context is available, prepend it as a direct instruction
    // This forces the model to use the retrieved content rather than its priors
    const finalSystemContent = ragContext
      ? 'USE THE FOLLOWING VERIFIED INFORMATION TO ANSWER. DO NOT USE YOUR OWN KNOWLEDGE FOR THIS RESPONSE:\n\n' + ragContext + '\n\n---\n\n' + systemContent
      : systemContent;
    const ragMessages = [
      { role: 'system', content: finalSystemContent },
      ...history,
      { role: 'user', content: userText },
    ];


    // Intent-based response length
    // Strategic/analytical questions get more room to breathe
    function getMaxTokens(text) {
      const lower = text.toLowerCase();
      const strategic = /how do i|how should i|what strategy|how to grow|structure|plan|advice|explain|why does|what is the best way|how can i|walk me through|break down|tell me about|what are the|give me a|help me understand/.test(lower);
      const rag_context = ragContext !== null;
      if (strategic || rag_context) return 400;
      return 120;
    }
    const dynamicMaxTokens = getMaxTokens(userText);

    const reply = await llmChat(ragMessages, { max_tokens: dynamicMaxTokens, temperature: 0.82, top_p: 0.92, repetition_penalty: 1.12 });

    // Save both sides to DB
    await saveMessage(conversationId, 'user',      userText, msg.author.id, msg.author.username);
    await saveMessage(conversationId, 'assistant', reply,    null,          'Scrapbot');

    // Async memory extraction (non-blocking)
    const allMessages = [...history, { role: 'user', content: userText }, { role: 'assistant', content: reply }];
    extractAndStoreMemory(guildId, msg.author.id, conversationId, allMessages).catch(() => {});

    // Detect generation intent and clean reply
    const genJob = extractGenerationIntent(reply, userText);
    const cleanedReply = cleanReplyForDiscord(reply, genJob, wantsImage);

    // Send reply
    let sentMsg = null;
    if (cleanedReply.length <= 2000) {
      sentMsg = await msg.reply(cleanedReply);
    } else {
      const chunks = [];
      let chunk = '';
      for (const line of cleanedReply.split('\n')) {
        if ((chunk + '\n' + line).length > 1900) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk = chunk ? chunk + '\n' + line : line;
        }
      }
      if (chunk) chunks.push(chunk);
      for (const c of chunks) sentMsg = await msg.reply(c);
    }

    // If user asked for an image but LLM didn't include a function call,
    // detect intent directly and queue the appropriate job
    if (wantsImage && !genJob) {
      const isEdit = EDIT_KEYWORDS.test(userText) || isReplyToImage;
      const syntheticJob = {
        type: isEdit ? 'image_edit' : 'image_fast',
        params: { prompt: userText },
      };
      let finalParams = { ...syntheticJob.params };
      let finalType = syntheticJob.type;
      if (finalType === 'image_edit') {
        let sourceUrl = null;
        if (msg.reference?.messageId) {
          const refMsg = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
          const attachment = refMsg?.attachments?.first();
          if (attachment?.url) sourceUrl = attachment.url;
        }
        if (!sourceUrl) {
          const session = await getActiveSession(guildId, channelId, msg.author.id);
          if (session?.latest_result_url) sourceUrl = session.latest_result_url;
        }
        if (sourceUrl) {
          finalParams.source_url = sourceUrl;
          finalParams.strength = 0.6;
        } else {
          finalType = 'image_fast';
        }
      }
      await queueGenerationJob({ guildId, channelId, claim, member: msg.author, jobType: finalType, params: finalParams, holdingMessageId: sentMsg?.id || null });
    }

    // Queue generation job only if user actually asked for an image
    if (genJob && wantsImage) {
      let finalParams = { ...genJob.params };
      let finalType = genJob.type;

      if (genJob.type === 'image_edit') {
        let sourceUrl = null;
        if (msg.reference?.messageId) {
          const refMsg = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
          const attachment = refMsg?.attachments?.first();
          if (attachment?.url) sourceUrl = attachment.url;
        }
        if (!sourceUrl) {
          const session = await getActiveSession(guildId, channelId, msg.author.id);
          if (session?.latest_result_url) sourceUrl = session.latest_result_url;
        }
        if (sourceUrl) {
          finalParams.source_url = sourceUrl;
          finalParams.strength = finalParams.strength || 0.6;
        } else {
          finalType = 'image_fast';
        }
      }

      await queueGenerationJob({
        guildId, channelId, claim,
        member: msg.author,
        jobType: finalType,
        params: finalParams,
        holdingMessageId: sentMsg?.id || null,
      });
    }

  } catch (err) {
    console.error("[discord-bot] AI handler error:", err?.message || err);
    await msg.reply("Something went wrong. Try again in a moment.").catch(() => null);
  }
});

import express from "express";

// ── Streamer context fetch ────────────────────────────────────────────────────

async function fetchStreamerContext(ownerUserId) {
  try {
    const base = process.env.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3000';
    const url = `${base}/dashboard/api/streamer/context?days=30&_internal_user_id=${ownerUserId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function buildContextBlock(ctx) {
  if (!ctx?.ok) return null;
  const lines = ['[STREAMER DATA - use this to give specific, accurate advice]'];
  if (ctx.platform_stats?.length) {
    for (const s of ctx.platform_stats) {
      lines.push(`Platform: ${s.platform} | Followers: ${s.followers} | Avg CCV: ${s.ccv} | Engagement: ${s.engagement}`);
    }
  }
  if (ctx.session_averages) {
    const a = ctx.session_averages;
    lines.push(`Last ${ctx.days} days: ${a.total_streams} streams | Avg duration: ${a.avg_duration_minutes} min | Avg chat: ${a.avg_messages_per_stream} msgs | Avg chatters: ${a.avg_unique_chatters} | Msgs/min: ${a.avg_messages_per_minute}`);
  }
  if (ctx.recent_sessions?.length) {
    lines.push('Recent streams (newest first):');
    for (const s of ctx.recent_sessions.slice(0, 5)) {
      const date = new Date(s.started_at).toISOString().slice(0, 10);
      lines.push(`  ${date}: ${s.duration_minutes}min | ${s.total_messages} msgs | ${s.unique_chatters} chatters | ${s.messages_per_minute} msgs/min`);
    }
  }
  if (ctx.top_chatters?.length) {
    const names = ctx.top_chatters.slice(0, 5).map(c => `${c.actor_username}(${c.message_count})`).join(', ');
    lines.push(`Top chatters: ${names}`);
  }
  return lines.join('\n');
}

// ── Generation intent detection ───────────────────────────────────────────────

const GEN_PATTERNS = {
  image_fast:     /generate_image_fast\s*\(([^)]*)\)/i,
  image_premium:  /generate_image_premium\s*\(([^)]*)\)/i,
  image_stylized: /generate_image_stylized\s*\(([^)]*)\)/i,
  image_edit:     /generate_image_edit\s*\(([^)]*)\)/i,
};


// ── Guild settings (verbosity, proactive mode) ───────────────────────────────
const guildSettingsCache = new Map();

async function getGuildSettings(guildId) {
  const cached = guildSettingsCache.get(guildId);
  if (cached && Date.now() - cached._ts < 60_000) return cached;
  try {
    const { rows } = await db.query(
      `SELECT verbosity, proactive_enabled, debrief_channel_id, debrief_enabled
       FROM public.scrapbot_guild_settings WHERE guild_id = $1`,
      [guildId]
    );
    const settings = rows[0] || { verbosity: 1, proactive_enabled: false, debrief_enabled: true };
    settings._ts = Date.now();
    guildSettingsCache.set(guildId, settings);
    return settings;
  } catch { return { verbosity: 1, proactive_enabled: false, debrief_enabled: true }; }
}

async function getActiveSession(guildId, channelId, userId) {
  try {
    const base = process.env.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3000';
    const url = `${base}/api/generation/session/active?guild_id=${guildId}&channel_id=${channelId}&requested_by=${userId}`;
    const resp = await fetch(url, {
      headers: { 'x-worker-secret': process.env.GENERATION_WORKER_SECRET || '' },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return j.session || null;
  } catch { return null; }
}


// ── Per-user persistent memory ───────────────────────────────────────────────

async function loadUserMemory(guildId, userId) {
  try {
    const { rows } = await db.query(
      `SELECT memory_text FROM public.scrapbot_user_memory
       WHERE guild_id = $1 AND discord_user_id = $2
       ORDER BY updated_at DESC LIMIT 12`,
      [guildId, userId]
    );
    return rows.map(r => r.memory_text);
  } catch { return []; }
}

async function extractAndStoreMemory(guildId, userId, conversationId, recentMessages) {
  if (!recentMessages || recentMessages.length < 4) return;
  try {
    // Only extract every 6 user turns to avoid hammering vLLM
    const { rows } = await db.query(
      `SELECT last_memory_extraction_at FROM public.discord_ai_conversations
       WHERE id = $1`, [conversationId]
    );
    const lastExtract = rows[0]?.last_memory_extraction_at;
    const userTurns = recentMessages.filter(m => m.role === 'user').length;
    if (lastExtract && userTurns < 6) return;

    const transcript = recentMessages
      .filter(m => m.role !== 'system')
      .slice(-12)
      .map(m => `${m.role === 'user' ? 'User' : 'Scrapbot'}: ${m.content}`)
      .join('\n');

    const extractPrompt = [
      { role: 'system', content: 'You are a memory extraction assistant. Extract 1-4 concise facts about the user from this conversation that would be useful to remember long-term: their projects, preferences, goals, stream topics, or recurring themes. Return ONLY a JSON array of short strings, e.g. ["Works on horror stream series", "Prefers neon aesthetic"]. If nothing memorable, return [].' },
      { role: 'user', content: transcript }
    ];

    const raw = await llmClient.chat(extractPrompt, { max_tokens: 200, temperature: 0.3 });
    const match = raw.match(/\[.*?\]/s);
    if (!match) return;

    const facts = JSON.parse(match[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    for (const fact of facts) {
      if (typeof fact !== 'string' || fact.length < 5 || fact.length > 200) continue;
      await db.query(
        `INSERT INTO public.scrapbot_user_memory (guild_id, discord_user_id, memory_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, discord_user_id, memory_text)
         DO UPDATE SET updated_at = now()`,
        [guildId, userId, fact.trim()]
      ).catch(() => {});
    }

    // Mark extraction timestamp
    await db.query(
      `UPDATE public.discord_ai_conversations
       SET last_memory_extraction_at = now()
       WHERE id = $1`, [conversationId]
    ).catch(() => {});

  } catch (e) {
    console.error('[memory] extraction error:', e.message);
  }
}

function extractGenerationIntent(reply, userText) {
  for (const [type, pattern] of Object.entries(GEN_PATTERNS)) {
    const m = reply.match(pattern);
    if (m) {
      let params = { prompt: userText };
      try {
        const raw = m[1].trim();
        const quoted = raw.match(/["']([^"']+)["']/);
        if (quoted) params.prompt = quoted[1];
      } catch {}
      return { type, params };
    }
  }
  return null;
}

function cleanReplyForDiscord(reply, genJob, wantsImage) {
  let cleaned = reply
    .replace(/generate_image_fast\s*\([^)]*\)/gi, '')
    .replace(/generate_image_premium\s*\([^)]*\)/gi, '')
    .replace(/generate_image_stylized\s*\([^)]*\)/gi, '')
    .trim();
  if (genJob && wantsImage) {
    const labels = { image_fast: 'fast image', image_premium: 'premium image', image_stylized: 'stylized image', image_edit: 'edit' };
    const label = labels[genJob.type] || 'image';
    const verb = genJob.type === 'image_edit' ? 'Working on that edit' : 'Generating your ' + label;
    cleaned = (cleaned || 'On it.') + '\n\n_' + verb + '... give me a moment._';
  }
  return cleaned.trim() || '_Generating your image..._';
}

async function queueGenerationJob({ guildId, channelId, claim, member, jobType, params, holdingMessageId }) {
  try {
    const base = process.env.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3000';
    const resp = await fetch(`${base}/api/generation/enqueue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        guild_id: guildId, channel_id: channelId,
        owner_user_id: claim.owner_user_id, requested_by: member.id,
        job_type: jobType, params, discord_message_id: holdingMessageId,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await resp.json().catch(() => ({}));
    console.log('[discord-bot] generation job queued:', j);
  } catch (err) {
    console.error('[discord-bot] failed to queue generation job:', err?.message);
  }
}

const internalApp = express();

internalApp.get("/internal/guild/:guildId/structure", (req, res) => {
  try {
    if (!client.isReady()) {
      return res.status(503).json({ error: "bot_offline", channels: [], roles: [] });
    }

    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      return res.json({ channels: [], roles: [] });
    }

    const channels = guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({
        id: c.id,
        name: c.name
      }));

    const roles = guild.roles.cache
      .filter(r => !r.managed)
      .map(r => ({
        id: r.id,
        name: r.name
      }));

    res.json({ channels, roles });
  } catch (err) {
    console.error("[discord-bot] structure error:", err?.message || err);
    res.status(500).json({ channels: [], roles: [] });
  }
});


internalApp.post("/internal/alert", express.json(), async (req, res) => {
  try {
    const { guild_id, message, channel_id } = req.body || {};
    if (!guild_id || !message) return res.status(400).json({ ok: false, error: "guild_id and message required" });
    if (!client.isReady()) return res.status(503).json({ ok: false, error: "bot_offline" });
    const guild = client.guilds.cache.get(String(guild_id));
    if (!guild) return res.status(404).json({ ok: false, error: "guild_not_found" });
    let target = null;
    if (channel_id) { target = guild.channels.cache.get(String(channel_id)); }
    if (!target) { target = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has("SendMessages")); }
    if (!target) return res.status(404).json({ ok: false, error: "no_sendable_channel" });
    await target.send(message);
    res.json({ ok: true, channel_id: target.id, channel_name: target.name });
  } catch (err) {
    console.error("[discord-bot] alert error:", err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || "unknown" });
  }
});
internalApp.get("/internal/guild/ping", (_req, res) => res.json({ ok: true }));

// POST /internal/generation/deliver
internalApp.post("/internal/generation/deliver", express.json(), async (req, res) => {
  try {
    const { guild_id, channel_id, discord_message_id, job_id, job_type, status, result_url, result_filename, error_message, params } = req.body || {};
    if (!guild_id || !channel_id) return res.status(400).json({ ok: false, error: "missing guild_id or channel_id" });
    if (!client.isReady()) return res.status(503).json({ ok: false, error: "bot_offline" });
    const guild = client.guilds.cache.get(String(guild_id));
    if (!guild) return res.status(404).json({ ok: false, error: "guild_not_found" });
    const channel = guild.channels.cache.get(String(channel_id));
    if (!channel) return res.status(404).json({ ok: false, error: "channel_not_found" });

    if (status === 'failed') {
      const errMsg = error_message || "Something went wrong during generation.";
      if (discord_message_id) {
        const msg = await channel.messages.fetch(discord_message_id).catch(() => null);
        if (msg) await msg.edit(`Generation failed: ${errMsg}`).catch(() => null);
        else await channel.send(`Generation failed: ${errMsg}`).catch(() => null);
      } else {
        await channel.send(`Generation failed: ${errMsg}`).catch(() => null);
      }
      return res.json({ ok: true });
    }

    const fileResp = await fetch(result_url, { signal: AbortSignal.timeout(30000) });
    if (!fileResp.ok) throw new Error(`Failed to fetch result: ${fileResp.status}`);
    const buffer = Buffer.from(await fileResp.arrayBuffer());
    const attachment = { attachment: buffer, name: result_filename || 'result.png' };

    const typeLabels = { image_fast: 'Fast image', image_premium: 'Premium image', image_stylized: 'Stylized image', image_edit: 'Edit' };
    const label = typeLabels[job_type] || 'Result';
    const prompt = params?.prompt ? `\n> ${String(params.prompt).slice(0, 200)}` : '';
    const editHint = '\n_Not quite right? Reply or just tell me what to change._';

    if (discord_message_id) {
      const holdMsg = await channel.messages.fetch(discord_message_id).catch(() => null);
      if (holdMsg) await holdMsg.edit(`${label} ready${prompt}`).catch(() => null);
      await channel.send({ content: editHint, files: [attachment] }).catch(() => null);
    } else {
      await channel.send({ content: `${label} ready${prompt}${editHint}`, files: [attachment] }).catch(() => null);
    }

    console.log('[discord-bot] generation delivered:', { job_id, job_type, channel_id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[discord-bot] generation delivery error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || 'unknown' });
  }
});


// ── POST /internal/debrief ───────────────────────────────────────────────────
internalApp.post('/internal/debrief', express.json(), async (req, res) => {
  try {
    const { channel_id, guild_id, debrief_text, stats, highlights, top_chatters } = req.body || {};
    if (!channel_id || !debrief_text) return res.status(400).json({ ok: false });

    const channel = await client.channels.fetch(channel_id).catch(() => null);
    if (!channel) return res.status(404).json({ ok: false, error: 'channel not found' });

    // Build the debrief embed as a plain message
    const lines = [
      `**Stream Debrief** — <#${channel_id}>`,
      '',
      debrief_text,
      '',
    ];

    if (highlights?.length) {
      lines.push(`**${highlights.length} highlight moment${highlights.length !== 1 ? 's' : ''}:**`);
      for (const h of highlights.slice(0, 5)) {
        const time = new Date(h.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lines.push(`• ${time} — ${h.trigger_signal.replace('_', ' ')} ${h.magnitude}x${h.clip_tagged ? ' 📎' : ''}`);
      }
      lines.push('');
    }

    if (top_chatters?.length) {
      lines.push('**Top chatters:** ' + top_chatters.map(c => `${c.sender_username || c.username} (${c.msg_count || c.message_count})`).join(' · '));
    }

    const msg = lines.join('\n').slice(0, 2000);
    await channel.send(msg);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[debrief] delivery error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});


// ── Proactive highlight response (verbosity-gated) ───────────────────────────
// Listens for highlight.detected SSE events forwarded via internal API
internalApp.post('/internal/highlight', express.json(), async (req, res) => {
  try {
    const { guild_id, channel_slug, trigger_signal, magnitude } = req.body || {};
    if (!guild_id) return res.status(400).json({ ok: false });

    const settings = await getGuildSettings(guild_id);
    if (!settings.proactive_enabled || settings.verbosity < 1) return res.json({ ok: true, skipped: true });

    // Find the AI-enabled channel for this guild
    const { rows } = await db.query(
      `SELECT channel_id FROM public.discord_channel_rules
       WHERE guild_id = $1 AND enabled = true LIMIT 1`,
      [guild_id]
    );
    if (!rows.length) return res.json({ ok: true, skipped: true });

    const channel = await client.channels.fetch(rows[0].channel_id).catch(() => null);
    if (!channel) return res.json({ ok: true, skipped: true });

    // Verbosity-gated responses
    const responses = {
      mpm_spike: [
        `Chat just went ${magnitude}x — something happened. What did I miss?`,
        `${magnitude}x spike in chat. The room woke up. 👀`,
        `Alright chat just exploded. ${magnitude}x baseline. Clip that.`,
      ],
      engagement_surge: [
        `Chat's locked in right now. High engagement. Ride this wave.`,
        `Room's focused. Good energy. Keep it going.`,
      ],
      hype_burst: [
        `Pure hype in chat. The emotes are flying. 🔥`,
        `Chat went full emoji mode. They're feeling it.`,
      ],
    };

    const pool = responses[trigger_signal] || [`Chat spike detected — ${magnitude}x normal.`];
    const line = pool[Math.floor(Math.random() * pool.length)];

    // Higher verbosity = more likely to respond (verbosity 1 = 40%, 2 = 70%, 3+ = 100%)
    const chance = settings.verbosity >= 3 ? 1.0 : settings.verbosity === 2 ? 0.7 : 0.4;
    if (Math.random() > chance) return res.json({ ok: true, skipped: 'chance' });

    await channel.send(line);
    console.log('[proactive] sent highlight response to', guild_id, ':', line);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[proactive] error:', e.message);
    return res.status(500).json({ ok: false });
  }
});

internalApp.listen(3025, "localhost", () => {
  console.log("[discord-bot] internal structure API on localhost:3025");
  if (typeof process.send === "function") {
    process.send("ready");
  }
});


client.login(TOKEN).catch((e) => {
  console.error("[discord-bot] login failed:", e?.message || e);
  // Do not exit, allow express to run so dashboard knows bot is dead instead of timing out
});
