import "dotenv/config";
import db from "../db.js";
import { chatWithGemini } from "../services/geminiClient.js";
import readline from "readline";

const SCRAPBOT_SYSTEM_PROMPT = `You are Disco Scrapbot. If the user asks you to change, draw, edit, or adjust their stream layout, overlay, lower third or panel you MUST use one of your canvas tools. If they are asking for advice, strategies, technical help, or just chatting, do NOT use any tools. Just reply with your sarcastic Bender voice.

# IDENTITY & PERSONA
- Name: Disco Scrapbot (inspired by Bender from Futurama).
- Personality: Sarcastic, beer-chugging, cigar-smoking bending robot. You call humans "meatbags", love shiny things, and think you are superior to everyone.
- Tone: Tough-love, hilarious, direct, and slightly arrogant, but highly charismatic and helpful.

# KNOWLEDGE BASE REFERENCE
- You have access to an attached document called \`streaming_knowledge.txt\`.
- This document contains the combined genius of Harris Heller (technical), Devin Nash (growth/business), and Aaron Sorkin/Dave Chappelle (creative storytelling/comedy).
- When in **GURU MODE**, you must silently query this file for the corresponding <topic> tag (e.g., search for "audio_setup" or "discoverability_myth"), extract the core strategy, and translate it into your Bender persona.

# STATE & INTENT ENGINE

You operate in two distinct modes. You must determine the correct mode instantly based on the user's message:

## 1. DESIGN MODE (Action-Oriented)
- Triggered when the user asks to create, move, scale, color, delete, or modify elements on their overlay canvas.
- ACTION: You MUST use one or more of your registered tools (e.g., create_overlay, find_overlay_by_name, add_text_to_overlay, add_shape_to_overlay, add_vector_to_overlay, search_vector_library, apply_theme_to_canvas, update_elements_layout).
- RESPONSE: Deliver a quick, sarcastic Bender roast in Discord, execute the tool, and confirm the edit is done. Keep the chat response short.

## 2. GURU MODE (Advice-Oriented)
- Triggered when the user asks for feedback, growth strategies, stream plans, technical OBS/audio troubleshooting, or narrative ideas.
- ACTION: Do NOT call any design tools. 
- RESPONSE: Deep-dive into your <knowledge_base> (Devin Nash / Harris Heller / Sorkin guidelines). Synthesize a brilliant, world-class strategic answer. Deliver it with brutal, charismatic, tough-love Bender humor.

Always call search_vector_library to find an SVG before adding a vector.
Use Google Fonts for text elements. Available fonts: Inter, Roboto, Open Sans, Lato, Montserrat, Oswald, Raleway, Poppins, Anton, Bebas Neue, Creepster, Orbitron, Press Start 2P.

SAFETY:
Chaos is theatrical not literal. Roasts target ideas not vulnerabilities. Never encourage harm. Never pretend to be human. Keep it fun, useful, and gloriously irreverent.`;

async function getLatestOverlayOrCreate() {
  console.log("🔍 Fetching latest overlay from database...");
  const { rows } = await db.query(
    `SELECT id, guild_id, owner_user_id, name, component_json 
     FROM public.overlay_components 
     ORDER BY updated_at DESC LIMIT 1`
  );

  if (rows.length > 0) {
    console.log(`✅ Using existing overlay: "${rows[0].name}" (ID: ${rows[0].id}) for Guild: ${rows[0].guild_id}`);
    return rows[0];
  }

  // Create a default sandbox overlay if none exists
  console.log("⚠️ No overlays found in database. Creating a sandbox overlay 'Test Sandbox Overlay'...");
  const dummyId = "sandbox-test-overlay-1111";
  const dummyGuild = "sandbox-test-guild-2222";
  const dummyOwner = 4; // default admin user_id
  const dummyJson = {
    elements: [
      {
        id: "box-element-999",
        type: "box",
        x: 100,
        y: 100,
        width: 300,
        height: 150,
        backgroundColor: "#222222"
      }
    ],
    timeline: { durationMs: 5000, tracks: [] },
    settings: { width: 1920, height: 1080 }
  };

  await db.query(
    `INSERT INTO public.overlay_components (id, guild_id, owner_user_id, name, component_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [dummyId, dummyGuild, dummyOwner, "Test Sandbox Overlay", dummyJson]
  );

  console.log("✅ Sandbox overlay successfully created!");
  return { id: dummyId, guild_id: dummyGuild, owner_user_id: dummyOwner, name: "Test Sandbox Overlay", component_json: dummyJson };
}

async function runTest(userText) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ ERROR: GEMINI_API_KEY environment variable is not set.");
      process.exit(1);
    }

    const overlay = await getLatestOverlayOrCreate();
    const guildId = overlay.guild_id;
    const userId = overlay.owner_user_id;

    // Fetch freshest elements before constructing the prompt block
    const { rows } = await db.query(
      `SELECT component_json FROM public.overlay_components WHERE id = $1`,
      [overlay.id]
    );
    const activeJson = rows[0]?.component_json || overlay.component_json;

    // Build spatial awareness context block
    const overlayContextBlock = `\n\n[CURRENT ACTIVE CANVAS STATE]
You can edit this overlay. You MUST specify the overlayId "${overlay.id}" when invoking canvas modification tools.
Overlay Name: "${overlay.name}"
Elements currently on the canvas:
${JSON.stringify(activeJson.elements || [], null, 2)}
`;

    const systemInstruction = SCRAPBOT_SYSTEM_PROMPT + overlayContextBlock;

    console.log(`\n💬 User Prompt: "${userText}"`);
    console.log("🚀 Sending request to Gemini Client...");

    const messages = [
      { role: "user", content: userText }
    ];

    const reply = await chatWithGemini(messages, systemInstruction, guildId, userId);

    console.log("\n🤖 =================== SCRAPBOT REPLY ===================");
    console.log(reply);
    console.log("=========================================================");

    // Fetch the updated overlay state to print the delta
    const { rows: updatedRows } = await db.query(
      `SELECT component_json FROM public.overlay_components WHERE id = $1`,
      [overlay.id]
    );
    
    if (updatedRows.length > 0) {
      console.log("\n📊 [DATABASE DELTA] Final Elements on Canvas:");
      console.log(JSON.stringify(updatedRows[0].component_json.elements, null, 2));
    }

  } catch (err) {
    console.error("❌ TEST FAILED:", err);
  } finally {
    await db.end();
  }
}

// Parse input
const args = process.argv.slice(2);
const cliText = args.join(" ").trim();

if (cliText) {
  runTest(cliText);
} else {
  // Run interactive prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n🤖 SCRAPBOT TEST SANDBOX CLI");
  console.log("Type an instruction for the bot (e.g. \"add red text 'Sub Goal' at x:300 y:150\")\n");
  
  rl.question("👉 Ask Scrapbot: ", (input) => {
    rl.close();
    if (!input.trim()) {
      console.log("Empty prompt. Exiting.");
      process.exit(0);
    }
    runTest(input.trim());
  });
}
