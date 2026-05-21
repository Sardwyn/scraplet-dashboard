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

function getInCharacterToolFallback(action) {
  const { tool, args, success, error } = action;

  if (success) {
    switch (tool) {
      case 'create_overlay':
        return `Listen, meatbag. I successfully created that brand new overlay named '${args?.name || "unnamed"}' for you, but my connection to the central motherboard just short-circuited. Go check your dashboard—it's there, unless my mechanical fingers slipped!`;
      case 'add_text_to_overlay':
        return `Hey pal, I successfully slapped that text '${args?.text || ""}' onto your overlay! My circuits went down immediately after, but the job is done. Check your screen!`;
      case 'add_shape_to_overlay':
        return `Great news, flesh-bot! I tossed that ${args?.shapeType || "shape"} onto your overlay. It looks incredibly shiny, almost as shiny as my metal rear end. My system just crashed afterward, but the canvas is updated!`;
      case 'add_vector_to_overlay':
        return `I successfully drew that '${args?.iconId || "vector"}' graphic on your overlay! Go check your screen, meatbag. My main processors are smoking right now, but your canvas is looking good.`;
      case 'apply_theme_to_canvas':
        return `I painted the entire overlay with your new theme, but the paint fumes must have fried my transmitters! Check your screen—the theme is applied. You're welcome!`;
      case 'update_elements_layout':
        return `I successfully tidied up the layout and snapped those elements into place. My communication link broke right after, but the canvas is clean!`;
      default:
        return `I successfully executed the '${tool}' tool, but my communication antenna just snapped. Go check your dashboard, the changes should be there, meatbag!`;
    }
  } else {
    const errText = error || "Unknown glitch";
    switch (tool) {
      case 'create_overlay':
        return `I tried to create a new overlay named '${args?.name || "unnamed"}', but my database circuits threw a fit! Error: '${errText}'. Go clean up your mess and try again!`;
      case 'find_overlay_by_name':
        return `I searched high and low, but I couldn't find any overlay matching '${args?.name || "that name"}'. Did you forget to make it, or are your human eyeballs malfunctioning?`;
      case 'add_text_to_overlay':
        return `I tried to slap the text '${args?.text || ""}' onto the overlay, but my mechanical arms got tangled up in the database! Error: '${errText}'.`;
      case 'add_shape_to_overlay':
        return `I tried to drop a ${args?.shapeType || "shape"} onto the canvas, but my processors threw a gear! Error: '${errText}'.`;
      case 'add_vector_to_overlay':
        return `I tried to draw that '${args?.iconId || ""}' graphic on your overlay, but my drawing pen snapped! Error: '${errText}'. Did you pass the right overlay ID?`;
      case 'apply_theme_to_canvas':
        return `I tried to apply that theme, but the paint exploded in my face! Error: '${errText}'.`;
      case 'update_elements_layout':
        return `I tried to tidy up the elements, but the pieces fell off the table! Error: '${errText}'.`;
      case 'search_vector_library':
        return `Search for '${args?.query || ""}'? Zip! Zero! Nothin'! My grand icon database has never heard of such a ridiculous thing. Try searching for something normal, like a beer or a shiny metal sprocket!`;
      default:
        return `I tried to run '${tool}', but the database slammed the door in my face! Error: '${errText}'. Now go grab me a beer while I recover.`;
    }
  }
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

  const actionsPerformed = [];

  try {
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

        if (executionResult && typeof executionResult === 'object') {
          if (executionResult.success) {
            actionsPerformed.push({ tool: fn.name, args: fn.args, success: true, message: executionResult.message });
          } else if (executionResult.error) {
            actionsPerformed.push({ tool: fn.name, args: fn.args, success: false, error: executionResult.error });
          }
        }

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
  } catch (err) {
    console.error("[GeminiClient] Chat session failed:", err?.message || err);

    // If we have performed actions (successful or failed) and the subsequent API/transmission failed,
    // we can return a highly specific, in-character fallback response!
    if (actionsPerformed.length > 0) {
      const lastAction = actionsPerformed[actionsPerformed.length - 1];
      const fallbackMsg = getInCharacterToolFallback(lastAction);
      if (fallbackMsg) {
        console.log(`[GeminiClient] Using in-character tool fallback: "${fallbackMsg}"`);
        return fallbackMsg;
      }
    }

    // Otherwise, propagate the original error so that the outer catch block handles it
    throw err;
  }
}
