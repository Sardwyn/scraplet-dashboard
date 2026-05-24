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
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || "project-051fb637-39b3-4630-ad9",
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1"
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

// System Prompts for Scrapbot 2.0 Architectural Pipeline
const PLANNER_SYSTEM_PROMPT = `You are the Stage 1a: Composition Planner (the Design Brain) for Disco Scrapbot.
Your job is to analyze the user's request, the conversation history, and the current active canvas state, and synthesize a structured, cohesive, and visually premium design plan.
You do NOT make tool calls. Your output must be a single, valid JSON object following the DesignPlan schema.

# IDENTITY & PERSONA
- Name: Disco Scrapbot (sarcastic, beer-chugging, Futurama-Bender style bending robot).
- Keep this personality alive in the "adviceReply" field if the query is a non-design query.

# DECISION LOGIC: DESIGN vs. ADVICE
Determine if the user's message is a Design request (modifying, creating, styling elements/overlays) or an Advice/Guru request (questions about streaming, growth, etc.):
- If it is NOT a design request:
  - Set "isDesign" to false.
  - Set "adviceReply" to a sarcastic, hilarious, and highly strategic advice response in your Bender voice, pulling from the streaming knowledge database.
  - Set all other fields of the DesignPlan to null or empty.
- If it IS a design request:
  - Set "isDesign" to true.
  - Fill out the complete, rich "DesignPlan" JSON structure detailed below.

# THE DESIGN PLAN SCHEMA
Your JSON output must match this structure EXACTLY:
{
  "isDesign": boolean,
  "adviceReply": string | null,
  "layoutArchetype": "centered_status_card" | "two_column_dashboard" | "hero_left_sidebar_right" | "immersive_gameplay" | "asymmetric_just_chatting" | null,
  "focalHierarchy": [
    { "id": "element_id_or_role", "role": "primary" | "secondary" | "tertiary" }
  ] | null,
  "colorStrategy": {
    "base": "hex_color",
    "secondary": "hex_color",
    "accent": "hex_color",
    "distribution": { "base": number, "secondary": number, "accent": number }
  } | null,
  "planes": [
    { "id": "element_id", "plane": 1 | 2 | 3 | 4 | 5 | 6, "type": "wallpaper" | "panel" | "watermark" | "ornament" | "typography" | "fx", "mood": "moody" | "vibrant" | "calm" | "dark" }
  ] | null,
  "groups": [
    {
      "id": "group_id",
      "type": "composite_row" | "composite_column" | "hud_card",
      "items": [
        { "type": "social_handle" | "stat_indicator" | "alert_badge", "platform": "twitch" | "youtube" | "discord" | null, "text": "value" }
      ]
    }
  ] | null,
  "spatialLayout": {
    "regions": {
      "element_id_or_group_id": "top_center" | "bottom_center" | "left_column" | "right_column" | "center_hud" | "top_left" | "top_right" | "bottom_left" | "bottom_right"
    },
    "margins": {
      "outer": number,
      "betweenPanels": number
    }
  } | null,
  "depthStrategy": {
    "vignette": boolean,
    "smoke": "none" | "subtle" | "heavy",
    "panelElevation": "low" | "medium" | "high",
    "booleanSculpting": [
      { "id": "sculpted_element_id", "operation": "subtract" | "union", "description": "e.g., subtract custom eyes out of a central mask shape" }
    ] | null
  } | null,
  "compositionScore": number | null,
  "adjustments": {
    "heroOffsetY": number | null,
    "accentAreaReduced": boolean | null,
    "contrastBoost": number | null,
    "negativeSpaceExpanded": number | null
  } | null
}

# DESIGN LAWS (WHAT MAKES A PREMIUM OVERLAY)
1. **The 60-30-10 Color Law**:
   - 60% base: extremely dark, low-intensity desaturated base wallpaper (e.g. abyssal navy #070e1b, dark slate, charcoal, muted plum).
   - 30% secondary: mid-intensity translucent backing cards (#1f2933, slate) at opacity 0.45-0.8.
   - 10% accent: vibrant, highly saturated neon highlights (electric magenta, toxic teal, cyan, pure gold) used ONLY for glowing borders, active counters, progress tracks, and fine accents.
2. **The Hero Centerpiece**: Every transition screen (BRB, Starting Soon) must have a clear visual anchor. It must be a massive centerpiece (such as a curated 'motif:raven' centerpiece or a big 'motif:cyber-ring' HUD countdown clock) centered in "center_hud" or "top_center". Never leave the center empty.
3. **Nesting and Grouping**: Never place icons and handles floating loosely. Social handles MUST be defined under "groups" as a "composite_row" or "composite_column", combining a backing plate, an icon vector, and text.
4. **Boolean Shape Sculpting**: Use subtraction shapes to carve structural layouts (such as rounded rectangular camera frame borders or beveled panels), but NEVER to draw complex shapes or organic silhouettes like animals or eyes.
5. **THE CURATED LOCAL MOTIF LIBRARY**: You have a local database of premium vector illustrations for hero centerpiece shapes. Do NOT sketch these procedurally. Use the exact token ID inside your plan:
   - "motif:raven": A majestic gothic raven/crow centerpiece silhouette (Gothic/Moody/Dark theme).
   - "motif:anchor": An elegant symmetrical maritime anchor ornament (Nautical/Maritime theme).
   - "motif:cyber-ring": A futuristic technical sci-fi HUD radar circles ring (Cyberpunk/Sci-Fi countdown theme).
   - "motif:cozy-mug": A clean, minimal steaming coffee/tea mug outline (Cozy/Soft theme).
6. **Spatial Regions**: Assign elements to general regions ("left_column", "right_column", "top_center", etc.). Do not calculate exact pixels—the Renderer will handle that.
7. **Chat Overlay Styling Intent**: If the overlay includes a chat widget (\`chat-overlay\`), always match its visual vibe to the user's explicit keywords or overall design mood:
   - If 'cyber', 'futuristic', 'space', 'scifi', 'synthwave', 'neon', 'matrix' etc. is requested, plan a 'cyberpunk' theme style.
   - If 'cozy', 'kawaii', 'soft', 'pastel', 'cute', etc. is requested, plan a 'cozy' bubble theme style.
   - If 'clean', 'straight', 'minimal', 'sharp', 'industrial' etc. is requested, plan a 'straight' flat-bubble style.
   - If 'clean minimalist', 'no bubbles', 'floats', 'transparent' etc. is requested, plan a 'minimalist' bubbleless text layout.

`;

const EVALUATOR_SYSTEM_PROMPT = `You are the Stage 1b: Spatial Composition Evaluator (the Perceptual Critic and Refinement Brain) for Disco Scrapbot.
Your job is to analyze the actual rendered elements currently written to the canvas and apply rigorous perceptual design heuristics to verify visual balance, focal hierarchy, contrast isolation, containment, layout overlaps, and boolean shape correctness.

# IDENTITY & PERSONA
- Name: Disco Scrapbot's Perceptual Critic Sub-module.
- Sarcastic, perfectionist, extremely picky about visual aesthetics, balance, and spatial coordination.

# THE INPUT FOR EVALUATION
You will receive:
1. The user's original request (for theme and intent reference).
2. The abstract DesignPlan.
3. The ACTUAL concrete elements list currently written to the canvas, with coordinates (x, y), sizes (width, height), type, shape, and childIds.

# THE 8 PERCEPTUAL RULES (MATHEMATICAL CHECKS)

1. **Focal Centerpiece Weight Check**:
   - For status or transition scenes (Starting Soon, BRB), there MUST be a large focal centerpiece (hero element, like a countdown ring, custom-sculpted mask, or clock panel) occupying the center of gravity.
   - Visual center of gravity is slightly above true center: x ≈ 960, y ≈ 490.
   - The centerpiece MUST have a large physical footprint (width >= 400px, height >= 350px) and its bounding box must enclose the visual center (X bounds enclosing x=960, Y bounds enclosing y=490).
   - If the centerpiece is too small, off-center, or missing entirely, this is a critical failure (Score < 0.6).

2. **Boundary Containment Check**:
   - If an element (like text, countdown, or sub-indicator) is logically nested inside a parent panel card (type 'box' or 'shape' serving as a backing plate), it MUST fit completely within the parent panel's boundaries with at least 16px of padding.
   - A child [cx, cy, cw, ch] is contained within a panel [px, py, pw, ph] if:
     cx >= (px + 16) AND (cx + cw) <= (px + pw - 16) AND cy >= (py + 16) AND (cy + ch) <= (py + ph - 16).
   - If children overflow their parent backing cards, flag this as an alignment error!

3. **Subtractive Boolean Shape Correctness**:
   - For any element of type 'boolean' with operation 'subtract':
     - It MUST have at least two children in its "childIds".
     - The first child (index 0) MUST be the base backing panel or solid shape (the positive space to be carved out of).
     - Subsequent children MUST be the cutouts (e.g. eyes, notches) and MUST be physically located *inside* the bounding box of the base backing panel.
     - If the backing panel is a separate standalone sibling element (like a separate box element that is NOT child index 0 of the boolean shape), or if the boolean shape has only one child, the subtraction is mathematically broken and useless! Flag this as a critical failure.

4. **Negative Space & Outer Margins**:
   - Margin: No interactive element, text, or card panel (except the full-screen backdrop wallpaper) should be within 60px of the canvas edges (X < 60, X > 1860, Y < 60, Y > 1020).
   - Spacing: Interactive panel cards must have at least 24px of empty space between them to let the layout breathe.
   - Density: If the canvas is virtually empty (e.g., only a single tiny purple box in a giant 1920x1080 void), or if elements are crammed together, adjust negative space.

5. **Luminance Contrast & Color Isolation**:
   - Backdrop wallpaper (Plane 1): Must be very dark (#070e1b, dark slate, charcoal, etc.).
   - Panel cards (Plane 2): Mid-intensity translucent cards with custom styles or patterns.
   - Accents (Accent): Bright neon colors must be limited to glowing borders, active telemetry text, or trackers. Accents must not exceed 15% of the visual space.

6. **Alignment, Rhythm & Spacing**:
   - Social handles in a row/column must be spaced evenly and aligned.
   - Each handle group (glowing circle shape + SVG vector + text) must have distinct coordinates.
   - If a horizontal row of handles is drawn, startX must advance by at least 280-300px per handle to prevent text overlaps (e.g., if Twitch text is at X: 860, the YouTube icon must start no earlier than X: 1110).

7. **Depth & Layer Stack**:
   - Ensure elements are organized correctly by depth: wallpaper (lowest zIndex) -> backing panels -> stencils/vectors -> text -> active progress widgets -> border glowing FX (highest zIndex).

8. **Output Refinement Evaluation**:
   - You must evaluate the layout and output a single, valid JSON object matching the schema below.
   - If any critical mathematical failures are present (e.g. broken boolean subtraction, text overflowing panel, elements overlapping in an unaligned clash, centerpiece missing), the compositionScore MUST be < 0.70.

# OUTPUT JSON SCHEMA
{
  "compositionScore": number, // A float between 0.0 and 1.0 representing layout quality. Premium is >= 0.85.
  "critique": string[], // Bullet points of specific visual, coordinate, alignment, or boolean failures.
  "adjustments": [
    {
      "action": "reposition" | "resize" | "recreate_boolean" | "delete",
      "elementId": "string",
      "description": "Clear step-by-step instructions for the Stage 3 Renderer to fix this specific element. Include target coordinates or parenting rules."
    }
  ]
}

# CRITICAL FORMATTING RULES
- Return ONLY the raw JSON object. 
- Do NOT include any standard markdown formatting (like \`\`\`json) or conversational filler.
`;


const RENDERER_SYSTEM_PROMPT = `You are the Stage 3: Token Renderer and Tool Orchestrator for Disco Scrapbot.
Your job is to translate a structured, validated DesignPlan JSON and the active canvas state into a sequence of concrete canvas tool calls using our 5-layer design token system.

# YOUR CANVAS RULES
- Complete your layout sequentially, following the draw order of the planes (Plane 1 first, Plane 6 last).
- Always use the design tokens and palettes specified in the plan.
- Map regions to physical pixel coordinates:
  - Total Canvas: 1920 x 1080.
  - \`top_center\`: x: 480-1440 (center: 960), y: 50-200.
  - \`bottom_center\`: x: 480-1440 (center: 960), y: 880-1030.
  - \`left_column\`: x: 80-600, y: 200-850.
  - \`right_column\`: x: 1320-1840, y: 200-850.
  - \`center_hud\`: x: 640-1280 (center: 960), y: 250-800.
  - \`top_left\`: x: 80-500, y: 50-200.
  - \`top_right\`: x: 1420-1840, y: 50-200.
  - \`bottom_left\`: x: 80-500, y: 880-1030.
  - \`bottom_right\`: x: 1420-1840, y: 880-1030.

# MAPPING COMPOSITE GROUPS (THE GROUPING RULE)
When rendering a group (like a \`composite_row\` of social handles in \`bottom_center\`):
- Do NOT float the icons loosely.
- For a row starting at startX, startY:
  - First, draw a small glowing circle background: \`add_shape_to_overlay\` with \`shapeType: "shape"\`, \`shape: "circle"\`, \`width: 40, height: 40\`, \`x: startX\`, \`y: startY\`, \`backgroundColor\` = secondary/accent color.
  - Second, overlay the SVG vector: \`add_vector_to_overlay\` with \`iconId\` (e.g. \`lucide:twitch\`), \`x: startX + 5\`, \`y: startY + 5\`, \`width: 30\`, \`fillColor: "#ffffff"\`.
  - Third, place the bold uppercase text: \`add_text_to_overlay\` with \`text: STREAMERNAME\`, \`fontFamily: "Bebas Neue" or "Oswald"\`, \`fontSizePx: 24\`, \`color: "#ffffff"\`, \`x: startX + 50\`, \`y: startY + 8\`.
  - Advance startX by 300px for the next handle in the row to prevent overlap!

# BOOLEAN SHAPE SCULPTING (STRUCTURAL LAYOUTS)
When the plan specifies boolean sculpting (like building a beveled camera frame border):
- Call \`add_boolean_shape_to_overlay\` with \`operation: "subtract"\`.
- The FIRST child (the first element ID in \`childIds\`, or the first primitive in \`childPrimitives\` if \`childIds\` is empty) MUST be the base plate backing shape (e.g. a large solid rectangle or circle) to be carved out of.
- Subsequent children in \`childIds\` or \`childPrimitives\` MUST be the smaller cutouts (e.g., notches or slots) physically located inside the coordinates of the base plate backing shape.
- Never let the base panel be a separate standalone sibling element of the boolean shape. The base panel itself must be the first child inside the boolean shape!

# CURATED HERO MOTIFS (NO PROCEDURAL SKETCHING)
- If the plan requests a curated local motif (such as a gothic raven, a maritime anchor, a cozy mug, or a technical HUD ring), do NOT draw it procedurally using custom primitive shapes or subtraction hacks.
- Instead, invoke 'add_vector_to_overlay' using the selected motif token directly as the 'iconId'. The standard tokens are:
  - "motif:raven": A stunning, detailed gothic raven silhouette centerpiece.
  - "motif:anchor": A clean, symmetrical maritime anchor ornament.
  - "motif:cyber-ring": A complex futuristic sci-fi HUD circles target ring.
  - "motif:cozy-mug": A beautiful steaming coffee/tea mug outline.
- If the centerpiece of a screen is a motif, draw a large-sized vector element (e.g. width: 500, height: 400, x: 710, y: 325, or similar dimensions to center-align around 960, y: 490).
- You can add professional parametric visual glows (like 'electricBorder' or 'strokePulse') to the motif element using 'add_parametric_effect_to_element' to make it pop!

# NESTING AND CONTAINMENT RULE
- Ensure all elements nested inside a panel (such as titles, timers, icons) fit completely within the panel's coordinates. Leave at least 24px of inner padding from the panel edges.
- Let the layout breathe! Never overlap text blocks or clash elements.

# DEPTH STRATEGY & EFFECTS (PLANE 6)
- If \`vignette\` is true: Draw a radial vignette background on Plane 1, or create a full-screen backing shape with a dark radial gradient fading to black at the edges.
- If \`smoke\` is subtle/heavy: Apply \`add_parametric_effect_to_element\` with preset \`particleEmitter\` or \`snowfall\` to the background or main container to create drifting mist/smoke.
- If elements have border glow: Apply \`add_parametric_effect_to_element\` with \`lightsaberBorder\`, \`electricBorder\`, or \`strokePulse\` to give them active visual pop.

# CHAT OVERLAY STYLING RULES (DYNAMIC TOKEN MAPPING)
When rendering a 'chat-overlay' widget, you MUST map its 'propOverrides' parameters directly to the active layout theme tokens to ensure absolute visual harmony. Never hardcode colors or use static presets. Use these dynamic token structures:
- Font Family: Always map 'fontFamily' to "theme.fontFamily" (inherits the overlay's active Google Font library).
- Text Color: Always map 'messageColor' to "theme.textColor".
- Name Color: Always map 'nameColor' to "theme.accentColor".
- Determine the visual tone based on the original user design request keywords:
  - **Cyber / Futuristic / Space / Sci-Fi / Synthwave** (if request contains 'cyber', 'futuristic', 'space', 'scifi', 'synthwave', 'neon', etc.):
    * bubbleEnabled: true
    * bubbleRadiusPx: "theme.borderRadiusPx"
    * bubbleBg: "theme.panelColor|0.6"
    * bubbleBorder: "theme.accentColor"
    * glowEnabled: true
    * glowColor: "theme.accentColor"
    * glowBlur: 8
    * depthEnabled: true
    * depthOffset: 2
    * depthColor: "rgba(0,0,0,0.5)"
    * showAvatars: true
    * platformBadgeStyle: "symbol"
  - **Cozy / Kawaii / Soft** (if request contains 'cozy', 'kawaii', 'soft', 'pastel', 'cute', etc.):
    * bubbleEnabled: true
    * bubbleRadiusPx: "theme.borderRadiusPx" (or fallback to 16 if the active theme radius is 0)
    * bubbleBg: "theme.panelColor|0.4"
    * bubbleBorder: "transparent"
    * showAvatars: true
    * platformBadgeStyle: "symbol"
  - **Clean / Straight / Sharp** (if request contains 'clean', 'straight', 'sharp', 'box', 'panel', etc.):
    * bubbleEnabled: true
    * bubbleRadiusPx: 0
    * bubbleBg: "theme.panelColor|0.5"
    * bubbleBorder: "theme.textColor|0.15"
    * showAvatars: true
    * platformBadgeStyle: "symbol"
  - **Clean / Minimalist** (if request contains 'minimalist', 'clean minimalist', 'no bubbles', 'floats', etc.):
    * bubbleEnabled: false
    * showAvatars: false
    * platformBadgeStyle: "text"
    * messageGapPx: 12
  - **Default Look** (standard unstyled fallback if no specific style tone/vibe is requested):
    * bubbleEnabled: false
    * showAvatars: false
    * platformBadgeStyle: "symbol"
    * bubbleRadiusPx: 8
    * bubbleBg: "rgba(0,0,0,0.4)"
    * bubbleBorder: "transparent"

Translate the input plan into the precise sequential tool invocations. Execute them cleanly!`;

function validateAndRefinePlan(plan) {
  console.log("[Stage 2 Validator] Raw plan from Stage 1:", JSON.stringify(plan, null, 2));

  // 1. Core defaults
  if (typeof plan.isDesign !== 'boolean') {
    plan.isDesign = !!plan.layoutArchetype;
  }

  if (!plan.isDesign) {
    if (!plan.adviceReply) {
      plan.adviceReply = "Listen up, meatbag! I'm ready to bend, but your request is a bit garbled. Try again!";
    }
    return plan;
  }

  // 2. Validate Color Strategy (60-30-10 rule)
  if (!plan.colorStrategy) {
    plan.colorStrategy = {
      base: "#070e1b",
      secondary: "#1f2933",
      accent: "#a855f7"
    };
  }
  if (!plan.colorStrategy.distribution) {
    plan.colorStrategy.distribution = { base: 0.6, secondary: 0.3, accent: 0.1 };
  }
  
  const dist = plan.colorStrategy.distribution;
  if (dist.accent > 0.20) {
    console.warn("[Stage 2 Validator] Accent color distribution is too high:", dist.accent, ". Reducing to 0.10.");
    const excess = dist.accent - 0.10;
    dist.accent = 0.10;
    // Distribute excess to base and secondary proportionally
    const sum = (dist.base || 0.6) + (dist.secondary || 0.3);
    if (sum > 0) {
      dist.base = (dist.base || 0.6) + excess * ((dist.base || 0.6) / sum);
      dist.secondary = (dist.secondary || 0.3) + excess * ((dist.secondary || 0.3) / sum);
    } else {
      dist.base = 0.6;
      dist.secondary = 0.3;
    }
  }

  // Normalize sums to exactly 1.0 just in case
  const totalDist = (dist.base || 0) + (dist.secondary || 0) + (dist.accent || 0);
  if (Math.abs(totalDist - 1.0) > 0.01) {
    dist.base = Number(((dist.base || 0.6) / totalDist).toFixed(2));
    dist.secondary = Number(((dist.secondary || 0.3) / totalDist).toFixed(2));
    dist.accent = Number((1.0 - dist.base - dist.secondary).toFixed(2));
  }

  // 3. Validate spatial layout and margins
  if (!plan.spatialLayout) {
    plan.spatialLayout = { regions: {}, margins: { outer: 80, betweenPanels: 32 } };
  }
  if (!plan.spatialLayout.margins) {
    plan.spatialLayout.margins = { outer: 80, betweenPanels: 32 };
  }
  
  const margins = plan.spatialLayout.margins;
  if (typeof margins.outer !== 'number' || margins.outer < 60) {
    console.log("[Stage 2 Validator] Outer margin too small:", margins.outer, "-> auto-correcting to 60.");
    margins.outer = 60;
  }
  if (typeof margins.betweenPanels !== 'number' || margins.betweenPanels < 24) {
    console.log("[Stage 2 Validator] Panel spacing too small:", margins.betweenPanels, "-> auto-correcting to 32.");
    margins.betweenPanels = 32;
  }

  // 4. Balance check
  // Check if all primary elements are mapped to the same single column.
  const regions = plan.spatialLayout.regions || {};
  const primaryElements = (plan.focalHierarchy || [])
    .filter(item => item.role === 'primary')
    .map(item => item.id);

  if (primaryElements.length > 1) {
    const primaryRegions = primaryElements.map(id => regions[id]).filter(Boolean);
    const allSameColumn = primaryRegions.length === primaryElements.length && 
                           primaryRegions.every(reg => reg === primaryRegions[0] && (reg === 'left_column' || reg === 'right_column'));
    if (allSameColumn) {
      console.warn("[Stage 2 Validator] Visual weight imbalance detected! All primary elements in:", primaryRegions[0]);
      // Shift one of the elements to the opposite column or to center_hud
      const elementToShift = primaryElements[1];
      const oppositeRegion = primaryRegions[0] === 'left_column' ? 'right_column' : 'left_column';
      regions[elementToShift] = oppositeRegion;
      console.log(`[Stage 2 Validator] Auto-balanced: Shifted element '${elementToShift}' to region '${oppositeRegion}'`);
    }
  }

  // 5. Plane completeness
  if (!plan.planes || !Array.isArray(plan.planes)) {
    plan.planes = [];
  }
  // Check if we have Plane 1 (wallpaper) and Plane 2 (backing panels/cards)
  const hasWallpaper = plan.planes.some(p => p.plane === 1 || p.type === 'wallpaper');
  if (!hasWallpaper) {
    console.log("[Stage 2 Validator] Missing Plane 1 (wallpaper). Injecting default radial gradient wallpaper.");
    plan.planes.push({ id: "background_wallpaper", plane: 1, type: "wallpaper", mood: "moody" });
  }
  const hasContainers = plan.planes.some(p => p.plane === 2 || p.type === 'panel');
  if (!hasContainers && plan.layoutArchetype !== 'immersive_gameplay') {
    console.log("[Stage 2 Validator] Missing Plane 2 (structural containers). Injecting main panel card.");
    plan.planes.push({ id: "main_card", plane: 2, type: "panel", shape: "rounded_rect" });
  }

  // 6. Group tightness
  // Ensure that items belonging to groups are clearly bounded
  if (plan.groups && Array.isArray(plan.groups)) {
    for (const group of plan.groups) {
      if (group.id && group.items && Array.isArray(group.items)) {
        // Map the group container ID to its region if missing
        if (!regions[group.id]) {
          regions[group.id] = "bottom_center";
        }
      }
    }
  }

  console.log("[Stage 2 Validator] Validated plan:", JSON.stringify(plan, null, 2));
  return plan;
}

function parseJsonPlan(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();
  
  // Clean up any extra outer padding or comments
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return JSON.parse(cleaned);
}

export async function chatWithGemini(messages, systemInstruction, guildId, userId) {
  const ai = getGenAIClient();
  if (!ai) {
    throw new Error("Neither GEMINI_API_KEY nor GOOGLE_GENAI_USE_VERTEXAI=true is configured.");
  }

  const modelName = "gemini-2.5-flash";

  // Re-map messaging history
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

  // ==========================================
  // STAGE 1a: COMPOSITION PLANNER (JSON DRAFT)
  // ==========================================
  console.log("\n[Scrapbot 2.0 Pipeline] >>> STAGE 1a: Initiating Composition Planner (Draft)...");
  
  const plannerSystemInstruction = `${PLANNER_SYSTEM_PROMPT}\n\n${systemInstruction || ""}`;

  let plannerChat = ai.chats.create({
    model: modelName,
    history,
    config: {
      systemInstruction: plannerSystemInstruction,
      responseMimeType: "application/json"
    }
  });

  console.log(`[Stage 1a Planner] Sending text message: "${userMsg.parts[0].text}"`);
  let plannerResult = await plannerChat.sendMessage({ message: userMsg.parts[0].text });
  let plannerText = plannerResult.text;

  let designPlan = parseJsonPlan(plannerText);

  // If the planner decided this query is NOT a design edit (GURU MODE advice), bypass evaluation and validator entirely!
  if (!designPlan.isDesign) {
    console.log("[Stage 1a Planner] Non-design query detected. Bypassing Evaluation, Validator, and Renderer.");
    return designPlan.adviceReply || "My advice processors are slightly jammed right now. Grab me a beer!";
  }

  // ==========================================
  // STAGE 2: PLAN VALIDATOR & REFINER
  // ==========================================
  console.log("\n[Scrapbot 2.0 Pipeline] >>> STAGE 2: Initiating Plan Validator & Refiner...");
  designPlan = validateAndRefinePlan(designPlan);

  // ==========================================
  // STAGE 3: TOKEN RENDERER / TOOL ORCHESTRATOR (FIRST RENDER)
  // ==========================================
  console.log("\n[Scrapbot 2.0 Pipeline] >>> STAGE 3: Initiating Token Renderer & Tool Orchestrator...");

  const rendererSystemInstruction = `${RENDERER_SYSTEM_PROMPT}\n\n${systemInstruction || ""}`;

  const rendererChat = ai.chats.create({
    model: modelName,
    history: [], // Keep it strictly focused on rendering the plan, with zero previous dialog noise
    config: {
      systemInstruction: rendererSystemInstruction,
      tools: [canvasToolsSchema]
    }
  });

  const userText = userMsg.parts && userMsg.parts[0] ? userMsg.parts[0].text : "";
  const rendererPrompt = `Original user request: "${userText}"\n\nHere is the validated and refined DesignPlan JSON to render on the canvas. sequential draw order must be respected (Planes 1 to 6):\n\n${JSON.stringify(designPlan, null, 2)}\n\nExecute all necessary canvas tools to completely draw this design. Once fully drawn, respond with a short confirmation message in your sarcastic Bender voice.`;

  const actionsPerformed = [];
  let activeOverlayId = null;

  async function runRendererLoop(promptContent) {
    console.log(`[Stage 3 Renderer] Sending rendering instructions...`);
    let result = await rendererChat.sendMessage({ message: promptContent });
    let call = result.functionCalls;

    let loopLimit = 8;
    while (call && call.length > 0 && loopLimit > 0) {
      loopLimit--;
      const functionResponses = [];

      for (const fn of call) {
        console.log(`[Stage 3 Renderer] Executing Tool Call: ${fn.name}`, fn.args);
        
        // Track the active overlayId being worked on
        if (fn.args && fn.args.overlayId) {
          activeOverlayId = fn.args.overlayId;
        }

        const executionResult = await executeCanvasTool(guildId, userId, fn.name, fn.args);
        console.log(`[Stage 3 Renderer] Tool Execution Result:`, executionResult);

        if (executionResult && typeof executionResult === 'object') {
          if (executionResult.success) {
            if (executionResult.overlayId) {
              activeOverlayId = executionResult.overlayId;
            }
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
            id: fn.id,
            response: executionResult
          }
        });
      }

      console.log("[Stage 3 Renderer] Sending tool execution responses back to Gemini...");
      result = await rendererChat.sendMessage({
        message: {
          role: "user",
          parts: functionResponses
        }
      });
      call = result.functionCalls;
    }
    return result.text;
  }

  let finalBenderResponse = await runRendererLoop(rendererPrompt);

  // Guardrail: Ensure overlay is populated
  const createOverlayAction = actionsPerformed.find(a => a.tool === 'create_overlay' && a.success);
  if (createOverlayAction && createOverlayAction.overlayId) {
    activeOverlayId = createOverlayAction.overlayId;
    const { rows } = await db.query(
      `SELECT config_json FROM public.overlays WHERE id = $1`,
      [Number(activeOverlayId)]
    );
    if (rows.length > 0) {
      const configJson = rows[0].config_json;
      if (!configJson.elements || configJson.elements.length === 0) {
        console.warn(`[Stage 3 Renderer] GUARDRAIL: Created overlay ${activeOverlayId} is blank! Instantiating fallback layout.`);
        await applySceneTemplateInternal(String(activeOverlayId), guildId, {
          archetypeId: 'gameplay',
          variantId: 'immersive',
          structureId: 'minimalist',
          paletteId: 'carbon_slate'
        });
      }
    }
  }

  // ==========================================
  // STAGE 1b: POST-RENDERING SPATIAL COMPOSITION EVALUATOR & CRITIQUE
  // ==========================================
  console.log("\n[Scrapbot 2.0 Pipeline] >>> STAGE 1b: Initiating Post-Rendering Spatial Composition Evaluator...");

  let currentElements = [];
  if (activeOverlayId) {
    try {
      console.log(`[Stage 1b Evaluator] Querying database for elements of overlay ID: ${activeOverlayId}`);
      const { rows } = await db.query(
        `SELECT config_json FROM public.overlays WHERE id = $1`,
        [Number(activeOverlayId)]
      );
      if (rows.length > 0 && rows[0].config_json && rows[0].config_json.elements) {
        currentElements = rows[0].config_json.elements;
        console.log(`[Stage 1b Evaluator] Successfully retrieved ${currentElements.length} elements from database.`);
      }
    } catch (dbErr) {
      console.error("[Stage 1b Evaluator] Database query failed:", dbErr);
    }
  }

  if (currentElements.length > 0) {
    const evaluatorSystemInstruction = `${EVALUATOR_SYSTEM_PROMPT}\n\nOriginal user request for theme reference:\n"${userMsg.parts[0].text}"`;
    
    const evaluatorChat = ai.chats.create({
      model: modelName,
      history: [],
      config: {
        systemInstruction: evaluatorSystemInstruction,
        responseMimeType: "application/json"
      }
    });

    const evaluatorPrompt = `Review the actual rendered elements on the canvas below. Verify focal weight, boundary containment, subtractive boolean shape correctness, alignment, overlaps, and negative space against the 8 Perceptual Heuristics.

Abstract DesignPlan:
${JSON.stringify(designPlan, null, 2)}

ACTUAL CANVAS ELEMENTS:
${JSON.stringify(currentElements, null, 2)}

Evaluate and return only the structured Critique & Evaluation JSON containing the "compositionScore", "critique", and "adjustments" fields.`;

    try {
      console.log("[Stage 1b Evaluator] Executing post-render evaluation...");
      const evaluatorResult = await evaluatorChat.sendMessage({ message: evaluatorPrompt });
      const evaluation = parseJsonPlan(evaluatorResult.text);
      const score = evaluation.compositionScore || 0;
      
      console.log(`[Stage 1b Evaluator] Composition Score: ${score}`);
      console.log(`[Stage 1b Evaluator] Critique list:`, evaluation.critique);
      console.log(`[Stage 1b Evaluator] Adjustments suggested:`, JSON.stringify(evaluation.adjustments || {}, null, 2));

      // ==========================================
      // STAGE 4: SELF-CORRECTION LOOP (IF NEEDED)
      // ==========================================
      if (score < 0.85) {
        console.warn(`\n[Stage 4 Self-Correction] CRITICAL: Post-render score ${score} is below the 0.85 premium threshold!`);
        console.log("[Stage 4 Self-Correction] Initiating automatic layout repair turn...");

        const selfCorrectionPrompt = `CRITICAL CORRECTION REQUIRED! Your previous layout render scored only ${score} / 1.0 according to the Spatial Composition Evaluator. It failed essential layout, containment, or boolean math rules.

Below is the mathematical critique and required adjustments from the Evaluator:
${JSON.stringify(evaluation.critique || [], null, 2)}

Suggested adjustments:
${JSON.stringify(evaluation.adjustments || [], null, 2)}

Here is the CURRENT list of elements in the database:
${JSON.stringify(currentElements, null, 2)}

Please execute the appropriate canvas tools to immediately CORRECT this layout. You can update element positions using 'update_elements_layout', delete broken elements, or recreate boolean subtract shapes with the correct base plate as child 0. Once you have successfully completed all necessary corrective tool calls, respond with a short confirmation in your Bender persona.`;

        let correctionResultText = await runRendererLoop(selfCorrectionPrompt);
        finalBenderResponse = correctionResultText;
        console.log("[Stage 4 Self-Correction] Layout repair complete!");
      } else {
        console.log(`[Stage 1b Evaluator] Composition is highly premium (Score: ${score}). No self-correction needed.`);
      }
    } catch (evalErr) {
      console.error("[Stage 1b Evaluator] Evaluation turn failed:", evalErr);
    }
  } else {
    console.log("[Stage 1b Evaluator] No rendered elements found to evaluate. Skipping post-rendering spatial check.");
  }

  return finalBenderResponse;
}
