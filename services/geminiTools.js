import { searchIcons, getIconSvgAsPaths } from './vectorLibrary.js';
import db from '../db.js';

export const canvasToolsSchema = {
  functionDeclarations: [
    {
      name: "create_overlay",
      description: "Creates a new stream overlay from scratch.",
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
          shapeType: { type: "STRING", description: "Must be 'box' or 'shape'" },
          shape: { type: "STRING", description: "If shapeType is 'shape', specify 'rect', 'circle', 'triangle', 'star', etc." },
          backgroundColor: { type: "STRING", description: "Hex color code." },
          x: { type: "INTEGER" },
          y: { type: "INTEGER" },
          width: { type: "INTEGER" },
          height: { type: "INTEGER" }
        },
        required: ["overlayId", "shapeType", "x", "y", "width", "height"]
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
      description: "Swaps all colors across the entire overlay JSON tree to match a new theme. Perfect for 'make it look like Halloween' requests.",
      parameters: {
        type: "OBJECT",
        properties: {
          overlayId: { type: "STRING" },
          primaryColor: { type: "STRING", description: "Hex code." },
          secondaryColor: { type: "STRING", description: "Hex code." },
          accentColor: { type: "STRING", description: "Hex code." }
        },
        required: ["overlayId", "primaryColor"]
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
    }
  ]
};
