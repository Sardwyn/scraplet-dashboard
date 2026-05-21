import db from './db.js';
import { executeCanvasTool } from './services/geminiToolHandlers.js';

async function run() {
  const guildId = '1087720283286274059';
  const userId = 4;
  const overlayId = 24;

  console.log("Applying gameplay/framed_hud template to overlay 24...");
  const result = await executeCanvasTool(guildId, userId, 'apply_scene_template', {
    overlayId,
    archetypeId: 'gameplay',
    variantId: 'framed_hud',
    structureId: 'modern_techno',
    paletteId: 'neon_sunset',
    sceneIntent: {
      energy: 'high',
      focus: 'gameplay',
      density: 'regular',
      tone: 'competitive'
    }
  });

  console.log("Result:", result);
  await db.end();
}

run().catch(console.error);
