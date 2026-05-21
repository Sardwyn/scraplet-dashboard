import { GoogleGenAI } from "@google/genai";
import { canvasToolsSchema } from "./geminiTools.js";
import { executeCanvasTool } from "./geminiToolHandlers.js";

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  
  if (apiKey) {
    console.log("[GeminiClient] Initializing Google AI Studio client (via API Key)");
    return new GoogleGenAI({ apiKey });
  } else if (useVertex) {
    console.log("[GeminiClient] Initializing Google Cloud Vertex AI client (via Application Default Credentials)");
    return new GoogleGenAI({
      apiKey: null // Forces client to use Google Application Default Credentials
    });
  }
  
  return null;
}

export async function chatWithGemini(messages, systemInstruction, guildId, userId) {
  const ai = getGenAIClient();
  if (!ai) {
    throw new Error("Neither GEMINI_API_KEY nor GOOGLE_GENAI_USE_VERTEXAI=true is configured.");
  }

  const isVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" && !process.env.GEMINI_API_KEY;
  
  // Google's unified model naming convention for gemini-2.5-flash
  const modelName = "gemini-2.5-flash";

  // Re-map messaging structure to match the new SDK format
  const history = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  const userMsg = history.pop();
  if (!userMsg) {
    throw new Error("No user message provided.");
  }

  const chatConfig = {
    systemInstruction,
    tools: [canvasToolsSchema]
  };

  // Provide explicit Vertex context if running on Vertex AI
  if (isVertex) {
    chatConfig.vertexContext = {
      project: process.env.GOOGLE_CLOUD_PROJECT || "project-051fb637-39b3-4630-ad9",
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1"
    };
  }

  const chat = ai.chats.create({
    model: modelName,
    history,
    config: chatConfig
  });

  console.log(`[GeminiClient] Sending text: "${userMsg.parts[0].text}"`);
  let result = await chat.sendMessage({ message: userMsg.parts[0].text });
  let call = result.functionCalls;

  let loopLimit = 5;
  while (call && call.length > 0 && loopLimit > 0) {
    loopLimit--;
    const functionResponses = [];

    for (const fn of call) {
      console.log(`[GeminiClient] Executing Canvas Tool: ${fn.name}`, fn.args);
      const executionResult = await executeCanvasTool(guildId, userId, fn.name, fn.args);
      console.log(`[GeminiClient] Canvas Tool Execution Result:`, executionResult);

      functionResponses.push({
        functionResponse: {
          name: fn.name,
          response: executionResult
        }
      });
    }

    console.log("[GeminiClient] Submitting tool feedback to Gemini...");
    result = await chat.sendMessage({ message: functionResponses });
    call = result.functionCalls;
  }

  return result.text;
}
