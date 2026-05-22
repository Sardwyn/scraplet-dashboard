import { searchIcons, getIconSvgAsPaths } from './vectorLibrary.js';
import db from '../db.js';

export const canvasToolsSchema = {
  functionDeclarations: [
    {
      name: "create_overlay",
      description: "Creates a new empty stream overlay from scratch. CRITICAL: You MUST immediately follow this up with apply_scene_template in the same turn to populate it, otherwise the user will see a blank screen.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING",
            description: "The name of the new overlay, e.g. 'Cyberpunk Main Layout'"
          }
        },
        required: ["name"]
      }
    },
    {
      name: "find_overlay_by_name",
      description: "Searches the user's existing overlays by name to get its overlayId. Use this to find the active context if the user asks to edit an existing overlay.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING",
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
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING", description: "The ID of the overlay to modify." },
          text: { type: "STRING", description: "The text content or dynamic binding tag." },
          fontFamily: { type: "STRING", description: "Google Font family name, e.g. 'Roboto', 'Creepster', 'Orbitron'." },
          color: { type: "STRING", description: "Hex color code for the text." },
          fontSizePx: { type: "INTEGER", description: "Font size in pixels." },
          x: { type: "INTEGER", description: "X coordinate in pixels." },
          y: { type: "INTEGER", description: "Y coordinate in pixels." }
        },
        required: ["overlayId", "text"]
      }
    },
    {
      name: "add_shape_to_overlay",
      description: "Adds a shape or box (like a backing plate for text) to the canvas.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          name: { type: "STRING", description: "Optional name of the shape element." },
          shapeType: { type: "STRING", description: "Must be 'box' or 'shape'" },
          shape: { type: "STRING", description: "If shapeType is 'shape', specify 'rect', 'circle', 'triangle', 'star', etc." },
          backgroundColor: { type: "STRING", description: "Hex color code or theme token reference (e.g., 'theme.panelColor')." },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER" },
          height: { type: "INTEGER" },
          fills: {
            type: "ARRAY",
            description: "Optional advanced fill configurations (solids or linear/radial gradients). Can use theme variable references like 'theme.bgColor'.",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", description: "Fill type: 'solid', 'linear', or 'radial'." },
                color: { type: "STRING", description: "Hex color or token string for solid fills." },
                opacity: { type: "NUMBER", description: "Fill opacity (0.0 to 1.0)." },
                angleDeg: { type: "NUMBER", description: "Angle in degrees for gradient fills." },
                stops: {
                  type: "ARRAY",
                  description: "Gradient stops array.",
                  items: {
                    type: "OBJECT",
                    properties: {
                      color: { type: "STRING", description: "Hex color code or theme reference." },
                      position: { type: "NUMBER", description: "Stop position (0.0 to 1.0)." }
                    },
                    required: ["color", "position"]
                  }
                }
              },
              required: ["type"]
            }
          },
          strokeColor: { type: "STRING", description: "Border stroke hex color or theme token, e.g. 'theme.accentColor'." },
          strokeWidthPx: { type: "INTEGER", description: "Border stroke thickness in pixels." },
          strokeAlign: { type: "STRING", description: "Stroke alignment relative to shape edge: 'inside', 'center', or 'outside'.", enum: ["inside", "center", "outside"] },
          strokeDash: { type: "STRING", description: "Border style: 'solid', 'dashed', or 'dotted'." },
          strokeOpacity: { type: "NUMBER", description: "Opacity of the stroke border, from 0.0 to 1.0." },
          cornerRadiusPx: { type: "INTEGER", description: "Corner radius in pixels." },
          cornerType: { type: "STRING", description: "Corner styling type: 'round', 'bevel', or 'square'.", enum: ["round", "bevel", "square"] },
          componentId: { type: "STRING", description: "Optional canonical component ID reference (e.g., 'webcam_frame_16_9') to fetch component-specific theme overrides." }
        },
        required: ["overlayId", "shapeType", "x", "y", "width", "height"]
      }
    },
    {
      name: "add_boolean_shape_to_overlay",
      description: "Creates a composite/hollow shape on the canvas using boolean operations (e.g., subtraction to create a camera frame).",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING", description: "The ID of the overlay to modify." },
          name: { type: "STRING", description: "Descriptive name for the composite shape, e.g. 'Camera Frame'." },
          operation: { type: "STRING", description: "The boolean combination operation.", enum: ["union", "subtract", "intersect", "exclude"] },
          childIds: {
            type: "ARRAY",
            description: "Optional array of existing element IDs to combine.",
            items: { type: "STRING" }
          },
          childPrimitives: {
            type: "ARRAY",
            description: "Optional array of inlined shape primitives to construct and combine.",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                type: { type: "STRING", description: "Usually 'shape' or 'mask' or 'box'." },
                shape: { type: "STRING", description: "Shape type: 'rect', 'circle', etc." },
                shapeType: { type: "STRING", description: "Element type: 'shape' or 'box' or 'mask'." },
                x: { type: "INTEGER" },
                y: { type: "INTEGER" },
                width: { type: "INTEGER" },
                height: { type: "INTEGER" },
                x_offset: { type: "INTEGER", description: "Offset x coordinate inside the parent frame." },
                y_offset: { type: "INTEGER", description: "Offset y coordinate inside the parent frame." },
                operation: { type: "STRING", description: "Boolean operation for this child: 'union', 'subtract', etc." },
                borderRadiusPx: { type: "INTEGER" }
              },
              required: ["shape", "width", "height"]
            }
          },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER" },
          height: { type: "INTEGER" },
          fills: {
            type: "ARRAY",
            description: "Optional fills for the resulting composite shape.",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING" },
                color: { type: "STRING" },
                opacity: { type: "NUMBER" },
                angleDeg: { type: "NUMBER" },
                stops: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      color: { type: "STRING" },
                      position: { type: "NUMBER" }
                    },
                    required: ["color", "position"]
                  }
                }
              },
              required: ["type"]
            }
          },
          strokeColor: { type: "STRING" },
          strokeWidthPx: { type: "INTEGER" },
          strokeAlign: { type: "STRING", enum: ["inside", "center", "outside"] },
          strokeOpacity: { type: "NUMBER" },
          borderRadiusPx: { type: "INTEGER" },
          componentId: { type: "STRING", description: "Optional canonical component ID reference (e.g., 'webcam_frame_16_9') to fetch component-specific theme overrides." }
        },
        required: ["overlayId", "name", "operation"]
      }
    },
    {
      name: "search_vector_library",
      description: "Searches the public Iconify API for SVG vectors. Use this to find icon IDs before calling add_vector_to_overlay.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Search term, e.g. 'gaming controller', 'skull', 'heart'" }
        },
        required: ["query"]
      }
    },
    {
      name: "add_vector_to_overlay",
      description: "Injects an SVG vector into the canvas using an Iconify icon ID. Always call search_vector_library first to get valid IDs.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          iconId: { type: "STRING", description: "The Iconify ID, e.g. 'lucide:gamepad-2'" },
          fillColor: { type: "STRING", description: "Hex color code to fill the vector." },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER", description: "Target width. Height will auto-scale if not provided." }
        },
        required: ["overlayId", "iconId"]
      }
    },
    {
      name: "apply_theme_to_canvas",
      description: "Swaps all colors across the entire overlay JSON tree to match a new theme or design tokens.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          primaryColor: { type: "STRING", description: "Hex code." },
          secondaryColor: { type: "STRING", description: "Hex code." },
          accentColor: { type: "STRING", description: "Hex code." },
          structureId: { type: "STRING", description: "Design token structure/bones ID to apply globally, e.g., 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "STRING", description: "Design token color palette/skin ID to apply globally, e.g., 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "update_elements_layout",
      description: "Batched update of elements for Auto-Layout (tidying up). Snaps or aligns multiple elements simultaneously.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          updates: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                elementId: { type: "STRING" },
                x: { type: "INTEGER" },
                y: { type: "INTEGER" },
                width: { type: "INTEGER" },
                height: { type: "INTEGER" }
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
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          name: { type: "STRING", description: "Name of the element." },
          bindingSourceId: { type: "STRING", description: "Binding source ID e.g. 'countdown', 'stake_monitor', or 'custom_variables'." },
          bindingFieldId: { type: "STRING", description: "Field ID inside the source, e.g. 'remainingSec', or a custom variable name." },
          bindingFallback: { type: "NUMBER", description: "Fallback numeric value (0..1)." },
          x: { type: "INTEGER", description: "X coordinate in pixels." },
          y: { type: "INTEGER", description: "Y coordinate in pixels." },
          width: { type: "INTEGER", description: "Width in pixels." },
          height: { type: "INTEGER", description: "Height in pixels." },
          backgroundColor: { type: "STRING", description: "Track background hex color." },
          fillColor: { type: "STRING", description: "Progress bar hex color." },
          borderRadiusPx: { type: "INTEGER" },
          direction: { type: "STRING", description: "Direction: 'ltr', 'rtl', 'ttb', 'btt'." },
          customVariableName: { type: "STRING", description: "Optional name of custom variable to bind to and auto-create if missing." },
          customVariableDefaultValue: { type: "NUMBER", description: "Default starting value if custom variable is created (0..1)." },
          structureId: { type: "STRING", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "STRING", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "STRING", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "add_progress_ring_to_overlay",
      description: "Adds a radial/circular progress ring element to the canvas. Can be bound to dynamic telemetry or a custom variable. If customVariableName is specified, it will be automatically registered if missing.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          name: { type: "STRING", description: "Name of the element." },
          bindingSourceId: { type: "STRING", description: "Binding source ID e.g. 'countdown', 'stake_monitor', or 'custom_variables'." },
          bindingFieldId: { type: "STRING", description: "Field ID inside the source, e.g. 'remainingSec', or a custom variable name." },
          bindingFallback: { type: "NUMBER", description: "Fallback numeric value (0..1)." },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER" },
          height: { type: "INTEGER" },
          strokeWidthPx: { type: "INTEGER", description: "Thickness of the ring stroke in pixels." },
          backgroundColor: { type: "STRING", description: "Track stroke hex color." },
          fillColor: { type: "STRING", description: "Progress fill hex color." },
          startAngleDeg: { type: "INTEGER", description: "Starting angle in degrees (default 0 or -90)." },
          customVariableName: { type: "STRING", description: "Optional name of custom variable to bind to and auto-create if missing." },
          customVariableDefaultValue: { type: "NUMBER", description: "Default starting value if custom variable is created (0..1)." },
          structureId: { type: "STRING", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "STRING", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "STRING", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "add_lower_third_to_overlay",
      description: "Adds a modular lower third overlay element (modular text banner). Supports both static title/subtitle text and dynamic stream telemetry event triggers.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          name: { type: "STRING" },
          title: { type: "STRING", description: "Static banner title. Overrides or falls back if dynamic bind is empty." },
          subtitle: { type: "STRING", description: "Static banner subtitle. Overrides or falls back if dynamic bind is empty." },
          alwaysOn: { type: "BOOLEAN", description: "Bypass active trigger key. If true, the lower third is always visible." },
          layoutMode: { type: "STRING", description: "Layout mode: 'single', 'stacked', 'split'." },
          variant: { type: "STRING", description: "Variant style: 'solid', 'glass', 'minimal', 'accent-bar'." },
          bindingTitleKey: { type: "STRING", description: "Optional custom event data key path to bind title text to." },
          bindingSubtitleKey: { type: "STRING", description: "Optional custom event data key path to bind subtitle text to." },
          bindingActiveKey: { type: "STRING", description: "Optional custom event data key path to trigger showing/hiding." },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER" },
          height: { type: "INTEGER" },
          fontFamily: { type: "STRING", description: "Google Fonts family name." },
          bgColor: { type: "STRING", description: "Hex background color." },
          bgOpacity: { type: "NUMBER", description: "Opacity from 0.0 to 1.0." },
          accentColor: { type: "STRING", description: "Accent border/bar hex color." },
          structureId: { type: "STRING", description: "Design token structure/bones ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "STRING", description: "Design token color palette/skin ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          anchorZone: { type: "STRING", description: "Dynamic vertical stack layout zone: 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'MIDDLE_LEFT', 'CENTER_HUD', 'MIDDLE_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT'." }
        },
        required: ["overlayId"]
      }
    },
    {
      name: "apply_scene_template",
      description: "Applies a structured scene layout archetype and variant layout to the canvas from scratch, incorporating design tokens and scene intent (e.g. energy, focus, density, tone).",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING", description: "The ID of the overlay to modify." },
          archetypeId: { type: "STRING", description: "The high-level stream scene type: 'just_chatting', 'gameplay', 'starting_soon', 'brb'." },
          variantId: { type: "STRING", description: "The structural layout variant: 'immersive', 'framed_split', 'centered', 'asymmetrical', 'framed_hud'." },
          structureId: { type: "STRING", description: "Optional structural style token ID, e.g. 'minimalist', 'pulp_comic', 'retro_cabinet', 'modern_techno', 'classic_serif', 'organic_hand', 'industrial_heavy', 'kawaii_soft', 'tactical_grid'." },
          paletteId: { type: "STRING", description: "Optional color palette token ID, e.g. 'carbon_slate', 'neon_sunset', 'amber_phosphor', 'kawaii_pastel', 'abyssal_glow', 'manga_contrast', 'military_olive', 'luxury_gold', 'industrial_rust', 'matrix_hacker', 'glacial_frost', 'sunset_vapor', 'chalkboard_sketch', 'copper_plate', 'midnight_royal'." },
          sceneIntent: {
            type: "OBJECT",
            description: "Optional parameters to dynamically adjust layout dimensions, density, spacing, animations and styling parameters.",
            properties: {
              energy: { type: "STRING", description: "Stream energy level: 'high' (active CSS pulsing, animations) or 'calm' (relaxed static transitions)." },
              focus: { type: "STRING", description: "Layout scale focus: 'creator' (webcam scaled up), 'chat' (chat expanded), or 'gameplay' (game space prioritized)." },
              density: { type: "STRING", description: "Layout padding density: 'minimal' (loose margins, filtered widgets) or 'packed' (compact, dense layouts)." },
              tone: { type: "STRING", description: "Styling tone: 'competitive' (sharp corners, heavy borders) or 'cozy' (large rounded corners, translucent panels)." }
            }
          }
        },
        required: ["overlayId", "archetypeId", "variantId"]
      }
    }
  ]
};

