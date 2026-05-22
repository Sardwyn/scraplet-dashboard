import { GoogleGenAI } from "@google/genai";
import { canvasToolsSchema } from "./geminiTools.js";
import { executeCanvasTool, applySceneTemplateInternal } from "./geminiToolHandlers.js";
import db from "../db.js";

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
      case 'apply_scene_template':
        return `Behold, meatbag! I successfully forged a brand new layout blueprint for your '${args?.archetypeId || "scene"}' overlay! It matches your requested design tone and energy perfectly. My communication link broke right after, but check your screen, the canvas is updated!`;
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
      case 'add_progress_bar_to_overlay':
        return `Alright meatbag, I slapped a shiny new progress bar onto your canvas! Its style matches the dominant theme of your overlay perfectly because I actually have taste. My transmitter fried right after, but check your screen, it's there!`;
      case 'add_progress_ring_to_overlay':
        return `Behold, flesh-bot! I drew a circular progress ring on your overlay. I styled it to blend in with your active theme because I'm a perfectionist. My connection cut out immediately after, but the canvas is updated!`;
      case 'add_lower_third_to_overlay':
        return `I tossed that modular lower third plate onto the bottom of your overlay! It matches the dominant colors and style of your overlay like a glove. My processor overheated right after, but your stream is looking way more professional now!`;
      default:
        return `I successfully executed the '${tool}' tool, but my communication antenna just snapped. Go check your dashboard, the changes should be there, meatbag!`;
    }
  } else {
    const errText = error || "Unknown glitch";
    switch (tool) {
      case 'create_overlay':
        return `I tried to create a new overlay named '${args?.name || "unnamed"}', but my database circuits threw a fit! Error: '${errText}'. Go clean up your mess and try again!`;
      case 'apply_scene_template':
        return `I tried to apply the '${args?.archetypeId || "scene"}' layout blueprint template, but the construction blueprint got jammed in my gears! Error: '${errText}'. Go double-check if your overlay ID is valid, meatbag!`;
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
      case 'add_progress_bar_to_overlay':
        return `I tried to build that progress bar for you, but my screwdriver slipped! Error: '${errText}'. Did you break the database?`;
      case 'add_progress_ring_to_overlay':
        return `I tried to bend a progress ring onto your screen, but the pipe broke! Error: '${errText}'. Go check if the overlay exists, bonehead!`;
      case 'add_lower_third_to_overlay':
        return `I tried to draw that fancy lower third panel, but the template blew up! Error: '${errText}'. Are you sure the overlay ID is correct?`;
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
            actionsPerformed.push({ 
              tool: fn.name, 
              args: fn.args, 
              success: true, 
              message: executionResult.message,
              overlayId: executionResult.overlayId
            });
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

    // Guardrail: if create_overlay was run successfully during this turn,
    // verify that the overlay is not left with an empty elements array.
    const createOverlayAction = actionsPerformed.find(a => a.tool === 'create_overlay' && a.success);
    if (createOverlayAction && createOverlayAction.overlayId) {
      const overlayId = createOverlayAction.overlayId;
      const { rows } = await db.query(
        `SELECT config_json FROM public.overlays WHERE id = $1`,
        [Number(overlayId)]
      );
      if (rows.length > 0) {
        const configJson = rows[0].config_json;
        if (!configJson.elements || configJson.elements.length === 0) {
          console.warn(`[GeminiClient] GUARDRAIL: Overlay ${overlayId} was created but has 0 elements! Force-applying fallback gameplay minimalist layout.`);
          // Force apply standard minimalist template
          await applySceneTemplateInternal(String(overlayId), guildId, {
            archetypeId: 'gameplay',
            variantId: 'immersive',
            structureId: 'minimalist',
            paletteId: 'carbon_slate'
          });
        }
      }
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
