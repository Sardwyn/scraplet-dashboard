import { searchIcons, getIconSvgAsPaths } from './vectorLibrary.js';
import db from '../db.js';

export const canvasToolsSchema = {
  functionDeclarations: [
    {
      name: "create_overlay",
      description: "Creates a new stream overlay from scratch. Can optionally take layout, theme structure, palette, and intent parameters to populate the canvas atomically in a single execution turn, avoiding empty/blank screens.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the new overlay, e.g. 'Cyberpunk Main Layout'"
          },
          archetypeId: {
            type: "string",
            description: "Optional. The high-level stream scene type to apply immediately: 'just_chatting', 'gameplay', 'starting_soon', 'brb'."
          },
          variantId: {
            type: "string",
            description: "Optional. The structural layout variant to apply immediately: 'immersive', 'framed_split', 'centered', 'asymmetrical', 'framed_hud'."
          },
          structureId: {
            type: "string",
            description: "Optional. Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'."
          },
          paletteId: {
            type: "string",
            description: "Optional. Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'."
          },
          sceneIntent: {
            type: "object",
            description: "Optional. Intent parameters to dynamically adjust layout dimensions, density, spacing, animations and styling parameters.",
            properties: {
              energy: { type: "string", description: "Stream energy level: 'high' (active CSS pulsing, animations) or 'calm' (relaxed static transitions)." },
              focus: { type: "string", description: "Layout scale focus: 'creator' (webcam scaled up), 'chat' (chat expanded), or 'gameplay' (game space prioritized)." },
              density: { type: "string", description: "Layout padding density: 'minimal' (loose margins, filtered widgets) or 'packed' (compact, dense layouts)." },
              tone: { type: "string", description: "Styling tone: 'competitive' (sharp corners, heavy borders) or 'cozy' (large rounded corners, translucent panels)." }
            }
          }
        },
        required: ["name"]
      }
    },
    {
      name: "find_overlay_by_name",
      description: "Searches the user's existing overlays by name to get its overlayId. Use this to find the active context if the user asks to edit an existing overlay.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name or partial name of the overlay to find."
          }
        },
        required: ["name"]
      }
    },
    {
      name: "add_text_to_overlay",
      description: "Adds a text element to the canvas. Use dynamic bindings like {{latest_subscriber}} for live data.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string", description: "The ID of the overlay to modify." },
          text: { type: "string", description: "The text content or dynamic binding tag." },
          fontFamily: { type: "string", description: "Google Font family name, e.g. 'Roboto', 'Creepster', 'Orbitron'." },
          color: { type: "string", description: "Hex color code for the text." },
          fontSizePx: { type: "integer", description: "Font size in pixels." },
          x: { type: "integer", description: "X coordinate in pixels." },
          y: { type: "integer", description: "Y coordinate in pixels." }
        },
        required: ["overlayId", "text"]
      }
    },
    {
      name: "add_shape_to_overlay",
      description: "Adds a shape or box (like a backing plate for text) to the canvas.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          name: { type: "string", description: "Optional name of the shape element." },
          shapeType: { type: "string", description: "Must be 'box' or 'shape'" },
          shape: { type: "string", description: "If shapeType is 'shape', specify 'rect', 'circle', 'triangle', 'star', etc." },
          backgroundColor: { type: "string", description: "Hex color code or theme token reference (e.g., 'theme.panelColor')." },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          fills: {
            type: "array",
            description: "Optional advanced fill configurations (solids or linear/radial gradients). Can use theme variable references like 'theme.bgColor'.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Fill type: 'solid', 'linear', or 'radial'." },
                color: { type: "string", description: "Hex color or token string for solid fills." },
                opacity: { type: "number", description: "Fill opacity (0.0 to 1.0)." },
                angleDeg: { type: "number", description: "Angle in degrees for gradient fills." },
                stops: {
                  type: "array",
                  description: "Gradient stops array.",
                  items: {
                    type: "object",
                    properties: {
                      color: { type: "string", description: "Hex color code or theme reference." },
                      position: { type: "number", description: "Stop position (0.0 to 1.0)." }
                    },
                    required: ["color", "position"]
                  }
                },
                pattern: { 
                  type: "string", 
                  enum: ["dot-grid", "scanline", "diagonal-stripe", "noise-grain"],
                  description: "Optional texture pattern preset to layer inside the fill." 
                },
                blendMode: { 
                  type: "string", 
                  enum: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"],
                  description: "Optional CSS blend-mode for patterns." 
                },
                patternScale: { 
                  type: "number", 
                  description: "Optional scaling factor for texture pattern (0.1 to 3.0)." 
                },
                patternOpacity: { 
                  type: "number", 
                  description: "Optional opacity layer for texture pattern (0.0 to 1.0)." 
                }
              },
              required: ["type"]
            }
          },
          strokeColor: { type: "string", description: "Border stroke hex color or theme token, e.g. 'theme.accentColor'." },
          strokeWidthPx: { type: "integer", description: "Border stroke thickness in pixels." },
          strokeAlign: { type: "string", description: "Stroke alignment relative to shape edge: 'inside', 'center', or 'outside'.", enum: ["inside", "center", "outside"] },
          strokeDash: { type: "string", description: "Border style: 'solid', 'dashed', or 'dotted'." },
          strokeOpacity: { type: "number", description: "Opacity of the stroke border, from 0.0 to 1.0." },
          cornerRadiusPx: { type: "integer", description: "Corner radius in pixels." },
          cornerType: { type: "string", description: "Corner styling type: 'round', 'bevel', or 'square'.", enum: ["round", "bevel", "square"] },
          componentId: { type: "string", description: "Optional canonical component ID reference (e.g., 'webcam_frame_16_9') to fetch component-specific theme overrides." },
          compositionVariant: {
            type: "string",
            enum: [
              "standard", 
              "oblong", 
              "trapezoid_left", 
              "trapezoid_right", 
              "skew", 
              "capsule", 
              "preset_cyber_notch", 
              "preset_tactical_beveled", 
              "preset_sci_fi_asymmetric", 
              "preset_organic_wave"
            ],
            description: "Optional visual styling/geometric shape composition preset matching active theme structural constraints."
          }
        },
        required: ["overlayId", "shapeType", "x", "y", "width", "height"]
      }
    },
    {
      name: "add_boolean_shape_to_overlay",
      description: "Creates a composite/hollow shape on the canvas using boolean operations (e.g., subtraction to create a camera frame).",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string", description: "The ID of the overlay to modify." },
          name: { type: "string", description: "Descriptive name for the composite shape, e.g. 'Camera Frame'." },
          operation: { type: "string", description: "The boolean combination operation.", enum: ["union", "subtract", "intersect", "exclude"] },
          childIds: {
            type: "array",
            description: "Optional array of existing element IDs to combine.",
            items: { type: "string" }
          },
          childPrimitives: {
            type: "array",
            description: "Optional array of inlined shape primitives to construct and combine.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", description: "Usually 'shape' or 'mask' or 'box'." },
                shape: { type: "string", description: "Shape type: 'rect', 'circle', etc." },
                shapeType: { type: "string", description: "Element type: 'shape' or 'box' or 'mask'." },
                x: { type: "integer" },
                y: { type: "integer" },
                width: { type: "integer" },
                height: { type: "integer" },
                x_offset: { type: "integer", description: "Offset x coordinate inside the parent frame." },
                y_offset: { type: "integer", description: "Offset y coordinate inside the parent frame." },
                operation: { type: "string", description: "Boolean operation for this child: 'union', 'subtract', etc." },
                borderRadiusPx: { type: "integer" }
              },
              required: ["shape", "width", "height"]
            }
          },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          fills: {
            type: "array",
            description: "Optional fills for the resulting composite shape.",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                color: { type: "string" },
                opacity: { type: "number" },
                angleDeg: { type: "number" },
                stops: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      color: { type: "string" },
                      position: { type: "number" }
                    },
                    required: ["color", "position"]
                  }
                },
                pattern: { 
                  type: "string", 
                  enum: ["dot-grid", "scanline", "diagonal-stripe", "noise-grain"],
                  description: "Optional texture pattern preset to layer inside the fill." 
                },
                blendMode: { 
                  type: "string", 
                  enum: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"],
                  description: "Optional CSS blend-mode for patterns." 
                },
                patternScale: { 
                  type: "number", 
                  description: "Optional scaling factor for texture pattern (0.1 to 3.0)." 
                },
                patternOpacity: { 
                  type: "number", 
                  description: "Optional opacity layer for texture pattern (0.0 to 1.0)." 
                }
              },
              required: ["type"]
            }
          },
          strokeColor: { type: "string" },
          strokeWidthPx: { type: "integer" },
          strokeAlign: { type: "string", enum: ["inside", "center", "outside"] },
          strokeOpacity: { type: "number" },
          borderRadiusPx: { type: "integer" },
          componentId: { type: "string", description: "Optional canonical component ID reference (e.g., 'webcam_frame_16_9') to fetch component-specific theme overrides." },
          compositionVariant: {
            type: "string",
            enum: [
              "standard", 
              "oblong", 
              "trapezoid_left", 
              "trapezoid_right", 
              "skew", 
              "capsule", 
              "preset_cyber_notch", 
              "preset_tactical_beveled", 
              "preset_sci_fi_asymmetric", 
              "preset_organic_wave"
            ],
            description: "Optional visual styling/geometric shape composition preset matching active theme structural constraints."
          }
        },
        required: ["overlayId", "name", "operation"]
      }
    },
    {
      name: "search_vector_library",
      description: "Searches the public Iconify API for SVG vectors. Use this to find icon IDs before calling add_vector_to_overlay.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term, e.g. 'gaming controller', 'skull', 'heart'" }
        },
        required: ["query"]
      }
    },
    {
      name: "add_vector_to_overlay",
      description: "Injects an SVG vector into the canvas using an Iconify icon ID. Always call search_vector_library first to get valid IDs.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          iconId: { type: "string", description: "The Iconify ID, e.g. 'lucide:gamepad-2'" },
          fillColor: { type: "string", description: "Hex color code to fill the vector." },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer", description: "Target width. Height will auto-scale if not provided." }
        },
        required: ["overlayId", "iconId"]
      }
    },
    {
      name: "apply_theme_to_canvas",
      description: "Swaps all colors across the entire overlay JSON tree to match a new theme or design tokens.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          primaryColor: { type: "string", description: "Hex code." },
          secondaryColor: { type: "string", description: "Hex code." },
          accentColor: { type: "string", description: "Hex code." },
          structureId: { type: "string", description: "Design token structure/bones ID to apply globally, e.g., 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "string", description: "Design token color palette/skin ID to apply globally, e.g., 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "update_elements_layout",
      description: "Batched update of elements for Auto-Layout (tidying up). Snaps or aligns multiple elements simultaneously.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                elementId: { type: "string" },
                x: { type: "integer" },
                y: { type: "integer" },
                width: { type: "integer" },
                height: { type: "integer" }
              },
              required: ["elementId"]
            }
          }
        },
        required: ["overlayId", "updates"]
      }
    },
    {
      name: "add_progress_bar_to_overlay",
      description: "Adds a horizontal progress bar element to the canvas. Can be bound to a dynamic telemetry source (e.g. countdown, stake_monitor) or a custom variable. If customVariableName is specified, it will be automatically registered if missing.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          name: { type: "string", description: "Name of the element." },
          bindingSourceId: { type: "string", description: "Binding source ID e.g. 'countdown', 'stake_monitor', or 'custom_variables'." },
          bindingFieldId: { type: "string", description: "Field ID inside the source, e.g. 'remainingSec', or a custom variable name." },
          bindingFallback: { type: "number", description: "Fallback numeric value (0..1)." },
          x: { type: "integer", description: "X coordinate in pixels." },
          y: { type: "integer", description: "Y coordinate in pixels." },
          width: { type: "integer", description: "Width in pixels." },
          height: { type: "integer", description: "Height in pixels." },
          backgroundColor: { type: "string", description: "Track background hex color." },
          fillColor: { type: "string", description: "Progress bar hex color." },
          borderRadiusPx: { type: "integer" },
          direction: { type: "string", description: "Direction: 'ltr', 'rtl', 'ttb', 'btt'." },
          customVariableName: { type: "string", description: "Optional name of custom variable to bind to and auto-create if missing." },
          customVariableDefaultValue: { type: "number", description: "Default starting value if custom variable is created (0..1)." },
          structureId: { type: "string", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "string", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "string", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "add_progress_ring_to_overlay",
      description: "Adds a radial/circular progress ring element to the canvas. Can be bound to dynamic telemetry or a custom variable. If customVariableName is specified, it will be automatically registered if missing.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          name: { type: "string", description: "Name of the element." },
          bindingSourceId: { type: "string", description: "Binding source ID e.g. 'countdown', 'stake_monitor', or 'custom_variables'." },
          bindingFieldId: { type: "string", description: "Field ID inside the source, e.g. 'remainingSec', or a custom variable name." },
          bindingFallback: { type: "number", description: "Fallback numeric value (0..1)." },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          strokeWidthPx: { type: "integer", description: "Thickness of the ring stroke in pixels." },
          backgroundColor: { type: "string", description: "Track stroke hex color." },
          fillColor: { type: "string", description: "Progress fill hex color." },
          startAngleDeg: { type: "integer", description: "Starting angle in degrees (default 0 or -90)." },
          customVariableName: { type: "string", description: "Optional name of custom variable to bind to and auto-create if missing." },
          customVariableDefaultValue: { type: "number", description: "Default starting value if custom variable is created (0..1)." },
          structureId: { type: "string", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "string", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "string", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "add_lower_third_to_overlay",
      description: "Adds a modular lower third overlay element (modular text banner). Supports both static title/subtitle text and dynamic stream telemetry event triggers.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string" },
          name: { type: "string" },
          title: { type: "string", description: "Static banner title. Overrides or falls back if dynamic bind is empty." },
          subtitle: { type: "string", description: "Static banner subtitle. Overrides or falls back if dynamic bind is empty." },
          alwaysOn: { type: "boolean", description: "Bypass active trigger key. If true, the lower third is always visible." },
          layoutMode: { type: "string", description: "Layout mode: 'single', 'stacked', 'split'." },
          variant: { type: "string", description: "Variant style: 'solid', 'glass', 'minimal', 'accent-bar'." },
          bindingTitleKey: { type: "string", description: "Optional custom event data key path to bind title text to." },
          bindingSubtitleKey: { type: "string", description: "Optional custom event data key path to bind subtitle text to." },
          bindingActiveKey: { type: "string", description: "Optional custom event data key path to trigger showing/hiding." },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          fontFamily: { type: "string", description: "Google Fonts family name." },
          bgColor: { type: "string", description: "Hex background color." },
          bgOpacity: { type: "number", description: "Opacity from 0.0 to 1.0." },
          accentColor: { type: "string", description: "Accent border/bar hex color." },
          structureId: { type: "string", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "string", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "string", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "apply_scene_template",
      description: "Applies a structured scene layout archetype and variant layout to the canvas from scratch, incorporating design tokens and scene intent (e.g. energy, focus, density, tone).",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string", description: "The ID of the overlay to modify." },
          archetypeId: { type: "string", description: "The high-level stream scene type: 'just_chatting', 'gameplay', 'starting_soon', 'brb'." },
          variantId: { type: "string", description: "The structural layout variant: 'immersive', 'framed_split', 'centered', 'asymmetrical', 'framed_hud'." },
          structureId: { type: "string", description: "Optional structural style token ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "string", description: "Optional color palette token ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          sceneIntent: {
            type: "object",
            description: "Optional parameters to dynamically adjust layout dimensions, density, spacing, animations and styling parameters.",
            properties: {
              energy: { type: "string", description: "Stream energy level: 'high' (active CSS pulsing, animations) or 'calm' (relaxed static transitions)." },
              focus: { type: "string", description: "Layout scale focus: 'creator' (webcam scaled up), 'chat' (chat expanded), or 'gameplay' (game space prioritized)." },
              density: { type: "string", description: "Layout padding density: 'minimal' (loose margins, filtered widgets) or 'packed' (compact, dense layouts)." },
              tone: { type: "string", description: "Styling tone: 'competitive' (sharp corners, heavy borders) or 'cozy' (large rounded corners, translucent panels)." }
            }
          }
        },
        required: ["overlayId", "archetypeId", "variantId"]
      }
    },
    {
      name: "add_widget_to_overlay",
      description: "Procedurally adds any of the 19 high-fidelity interactive stream widgets to the overlay canvas with positional boundaries and custom prop styling configurations.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string", description: "The ID of the overlay to modify." },
          widgetId: { 
            type: "string", 
            description: "The unique type identifier of the widget.",
            enum: [
              "chat-overlay",
              "alert-box-widget",
              "sub-counter",
              "poll",
              "countdown",
              "top-supporters",
              "media-queue",
              "viewer-count",
              "ticker",
              "event-console-widget",
              "raffle",
              "hype-train",
              "subathon-timer",
              "tts-player",
              "emote-counter",
              "emote-wall",
              "random-number",
              "sound-visualizer",
              "top-donators",
              "stake-monitor"
            ]
          },
          x: { type: "integer", description: "X coordinate in pixels." },
          y: { type: "integer", description: "Y coordinate in pixels." },
          width: { type: "integer", description: "Width in pixels." },
          height: { type: "integer", description: "Height in pixels." },
          name: { type: "string", description: "Optional custom descriptive name for the canvas node." },
          propOverrides: {
            type: "object",
            description: "Optional key-value parameters to directly override default styles/behaviours of the widget (e.g., custom fonts, theme colors, limits)."
          },
          anchorZone: {
            type: "string",
            description: "Optional vertical/horizontal layout anchoring stack zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'."
          }
        },
        required: ["overlayId", "widgetId"]
      }
    },
    {
      name: "add_parametric_effect_to_element",
      description: "Applies real-time hardware-accelerated parametric visual effects (like lightsaber glows, matrix rain, fire, or scanlines) to any existing element on the canvas.",
      parameters: {
        type: "object",
        properties: {
          overlayId: { type: "string", description: "The ID of the overlay to modify." },
          elementId: { type: "string", description: "The target canvas element's ID." },
          preset: {
            type: "string",
            description: "The parametric effect style template to apply.",
            enum: [
              "lightsaberBorder", "electricBorder", "strokePulse", "hologramFlicker", 
              "ripple", "lensFlare", "cornerBrackets", "particleEmitter", 
              "fireEmitter", "lightningArc", "snowfall", "rain", "motionTrail", 
              "filmGrain", "tapeNoise"
            ]
          },
          params: {
            type: "object",
            description: "Custom configuration properties specific to the chosen preset (colors, speed, density, opacity)."
          },
          bindings: {
            type: "object",
            description: "Optional real-time telemetry bindings mapping parameter keys to live sensors. Each key is the parameter name (e.g., 'speed', 'intensity', 'blur', 'radius', 'scale'). The value is an object containing: sourceId (string, e.g., 'room_intel'), fieldId (string, e.g., 'mpm', 'viewers', 'r1', 'engagement_index'), inputMin (number, expected lower telemetry bound), inputMax (number, expected upper telemetry bound), targetMin (number, value at inputMin), targetMax (number, value at inputMax)."
          }
        },
        required: ["overlayId", "elementId", "preset"]
      }
    }
  ]
};

