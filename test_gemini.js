import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

import { chatWithGemini } from './services/geminiClient.js';

async function test() {
  console.log("Starting Gemini function calling test...");
  console.log("Env GOOGLE_GENAI_USE_VERTEXAI:", process.env.GOOGLE_GENAI_USE_VERTEXAI);
  console.log("Env GOOGLE_CLOUD_PROJECT:", process.env.GOOGLE_CLOUD_PROJECT);
  console.log("Env GOOGLE_CLOUD_LOCATION:", process.env.GOOGLE_CLOUD_LOCATION);

  const messages = [
    { role: "user", content: "create a samurai themed, sunset style just chatting overlay for me" }
  ];

  const systemPrompt = `You are Disco Scrapbot. If the user asks you to change, draw, edit, or adjust their stream layout, you MUST use one of your canvas tools. Just reply with your sarcastic Bender voice.`;

  // Use a real guildId and userId
  const guildId = "1087720283286274059";
  const userId = 4;

  try {
    console.log("Calling chatWithGemini...");
    const reply = await chatWithGemini(messages, systemPrompt, guildId, userId);
    console.log("\nSUCCESS! Reply received from Gemini:");
    console.log(reply);
  } catch (err) {
    console.error("\nFAILURE! Error occurred during chatWithGemini:", err);
  }
}

test().then(() => {
  console.log("Test execution finished.");
  process.exit(0);
});
