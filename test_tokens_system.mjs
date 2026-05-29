import db from './db.js';
import { executeCanvasTool } from './services/geminiToolHandlers.js';

async function run() {
  console.log("--- Starting Token & Layout Engine Verification ---");

  // 1. Fetch a valid active guild integration to use for testing
  const { rows: guilds } = await db.query(
    `SELECT guild_id, owner_user_id FROM public.discord_guild_integrations
     WHERE status = 'active'
     LIMIT 1`
  );

  if (guilds.length === 0) {
    console.error("No active guild integration found to perform test. Please check the DB.");
    process.exit(1);
  }

  const { guild_id: guildId, owner_user_id: userId } = guilds[0];
  console.log(`Using Guild ID: ${guildId}, User ID: ${userId}`);

  // 2. Create a test overlay
  console.log("\n[TEST] Creating test overlay...");
  const createResult = await executeCanvasTool(guildId, userId, 'create_overlay', {
    name: "Verification Overlay"
  });
  console.log("Create Result:", createResult);
  if (!createResult.success) {
    console.error("Failed to create test overlay");
    process.exit(1);
  }

  const overlayId = createResult.overlayId;

  try {
    // 3. Add a progress bar using minimalist Bones and carbon_slate Skin in TOP_LEFT anchor zone
    console.log("\n[TEST] Adding Progress Bar 1 with minimalist bones + carbon_slate skin to TOP_LEFT zone...");
    const pb1Result = await executeCanvasTool(guildId, userId, 'add_progress_bar_to_overlay', {
      overlayId,
      name: "Minimalist Progress Bar",
      structureId: "minimalist",
      paletteId: "carbon_slate",
      anchorZone: "TOP_LEFT"
    });
    console.log("PB1 Result:", pb1Result);

    // 4. Add a second progress bar in the same TOP_LEFT anchor zone to verify layout stacking
    console.log("\n[TEST] Adding Progress Bar 2 (retro_cabinet + neon_sunset) to same TOP_LEFT zone (verifying stack spacing)...");
    const pb2Result = await executeCanvasTool(guildId, userId, 'add_progress_bar_to_overlay', {
      overlayId,
      name: "Retro Progress Bar",
      structureId: "retro_cabinet",
      paletteId: "neon_sunset",
      anchorZone: "TOP_LEFT"
    });
    console.log("PB2 Result:", pb2Result);

    // 5. Add a progress ring in BOTTOM_CENTER zone with modern_techno + abyssal_glow
    console.log("\n[TEST] Adding Progress Ring with modern_techno bones + abyssal_glow skin to BOTTOM_CENTER zone...");
    const ringResult = await executeCanvasTool(guildId, userId, 'add_progress_ring_to_overlay', {
      overlayId,
      name: "Bioluminescent Ring",
      structureId: "modern_techno",
      paletteId: "abyssal_glow",
      anchorZone: "BOTTOM_CENTER"
    });
    console.log("Ring Result:", ringResult);

    // 6. Add a lower third in BOTTOM_LEFT zone with classic_serif + luxury_gold
    console.log("\n[TEST] Adding Lower Third with classic_serif bones + luxury_gold skin to BOTTOM_LEFT zone...");
    const ltResult = await executeCanvasTool(guildId, userId, 'add_lower_third_to_overlay', {
      overlayId,
      name: "Elegant Banner",
      title: "Antigravity Stream",
      subtitle: "Verifying V3 Style Matrix",
      structureId: "classic_serif",
      paletteId: "luxury_gold",
      anchorZone: "BOTTOM_LEFT"
    });
    console.log("Lower Third Result:", ltResult);

    // 7. Verify explicit overrides (Escape Hatches) - write absolute coordinate and specific background fill color
    console.log("\n[TEST] Adding Progress Bar 3 with explicit overrides (Escape Hatches: absolute X/Y, custom height and fill color)...");
    const pbOverrideResult = await executeCanvasTool(guildId, userId, 'add_progress_bar_to_overlay', {
      overlayId,
      name: "Escape Hatch Bar",
      x: 350,
      y: 200,
      width: 500,
      height: 45,
      backgroundColor: "#222222",
      fillColor: "#ff007f", // hot pink override
      borderRadiusPx: 25
    });
    console.log("Override PB Result:", pbOverrideResult);

    // 8. Load updated overlay to perform assertions
    const { rows: overlays } = await db.query(
      `SELECT config_json FROM public.overlays WHERE id = $1`,
      [Number(overlayId)]
    );
    const updatedJson = overlays[0].config_json;

    console.log("\n--- Checking Resolved Values in config_json ---");

    const elPb1 = updatedJson.elements.find(e => e.name === "Minimalist Progress Bar");
    const elPb2 = updatedJson.elements.find(e => e.name === "Retro Progress Bar");
    const elRing = updatedJson.elements.find(e => e.name === "Bioluminescent Ring");
    const elLt = updatedJson.elements.find(e => e.name === "Elegant Banner");
    const elOverride = updatedJson.elements.find(e => e.name === "Escape Hatch Bar");

    console.log("PB1 (Minimalist / Carbon Slate):");
    console.log(`  - Position: X=${elPb1.x}, Y=${elPb1.y}, W=${elPb1.width}, H=${elPb1.height}`);
    console.log(`  - Styling: BG=${elPb1.backgroundColor}, Fill=${elPb1.fillColor}, Radius=${elPb1.borderRadiusPx}`);
    console.log(`  - Metadata: structureId=${elPb1.structureId}, paletteId=${elPb1.paletteId}, anchorZone=${elPb1.anchorZone}`);

    console.log("PB2 (Retro / Neon Sunset - stacked below PB1):");
    console.log(`  - Position: X=${elPb2.x}, Y=${elPb2.y}, W=${elPb2.width}, H=${elPb2.height}`);
    console.log(`  - Styling: BG=${elPb2.backgroundColor}, Fill=${elPb2.fillColor}, Radius=${elPb2.borderRadiusPx}`);
    console.log(`  - Metadata: structureId=${elPb2.structureId}, paletteId=${elPb2.paletteId}, anchorZone=${elPb2.anchorZone}`);

    console.log("Progress Ring (Modern Techno / Abyssal Glow):");
    console.log(`  - Position: X=${elRing.x}, Y=${elRing.y}, W=${elRing.width}, H=${elRing.height}`);
    console.log(`  - Styling: BG=${elRing.backgroundColor}, Fill=${elRing.fillColor}`);
    console.log(`  - Metadata: structureId=${elRing.structureId}, paletteId=${elRing.paletteId}, anchorZone=${elRing.anchorZone}`);

    console.log("Lower Third (Classic Serif / Luxury Gold):");
    console.log(`  - Position: X=${elLt.x}, Y=${elLt.y}, W=${elLt.width}, H=${elLt.height}`);
    console.log(`  - Style properties:`);
    console.log(`    - BG: ${elLt.style.bgColor} (Opacity ${elLt.style.bgOpacity})`);
    console.log(`    - Accent Color: ${elLt.style.accentColor}`);
    console.log(`    - Font Family: ${elLt.style.fontFamily}`);
    console.log(`    - Corner Radius: ${elLt.style.cornerRadiusPx}px`);
    console.log(`    - Title Color: ${elLt.style.titleColor}`);
    console.log(`    - Subtitle Color: ${elLt.style.subtitleColor}`);
    console.log(`    - Variant: ${elLt.style.variant}`);
    console.log(`  - Metadata: structureId=${elLt.structureId}, paletteId=${elLt.paletteId}, anchorZone=${elLt.anchorZone}`);

    console.log("Override PB (Escape Hatch):");
    console.log(`  - Position (Absolute): X=${elOverride.x}, Y=${elOverride.y}, W=${elOverride.width}, H=${elOverride.height}`);
    console.log(`  - Styling (Overridden): BG=${elOverride.backgroundColor}, Fill=${elOverride.fillColor}, Radius=${elOverride.borderRadiusPx}`);

    // Verify stacking logic
    const pb1Bottom = elPb1.y + elPb1.height;
    const expectedPb2Y = pb1Bottom + 20;
    if (elPb2.y === expectedPb2Y) {
      console.log(`\n[SUCCESS] Vertical stacking validated perfectly! PB2.y (${elPb2.y}) is exactly PB1.bottom (${pb1Bottom}) + 20px gap.`);
    } else {
      console.error(`\n[FAIL] Vertical stacking failed. PB2.y=${elPb2.y}, expected=${expectedPb2Y}`);
    }

    // 9. Verify Apply Theme to Canvas
    console.log("\n[TEST] Applying theme matrix globally (tactical_grid bones + matrix_hacker skin)...");
    const themeResult = await executeCanvasTool(guildId, userId, 'apply_theme_to_canvas', {
      overlayId,
      structureId: "tactical_grid",
      paletteId: "matrix_hacker"
    });
    console.log("Theme Application Result:", themeResult);

    // Load canvas after global theme update
    const { rows: finalOverlays } = await db.query(
      `SELECT config_json FROM public.overlays WHERE id = $1`,
      [Number(overlayId)]
    );
    const finalJson = finalOverlays[0].config_json;

    const finalPb1 = finalJson.elements.find(e => e.name === "Minimalist Progress Bar");
    const finalLt = finalJson.elements.find(e => e.name === "Elegant Banner");

    console.log("\n--- Checking Updated Values After Theme Overhaul ---");
    console.log("PB1 updated styling:");
    console.log(`  - BG=${finalPb1.backgroundColor} (Expected #000000)`);
    console.log(`  - Fill=${finalPb1.fillColor} (Expected #22c55e)`);
    console.log(`  - Radius=${finalPb1.borderRadiusPx} (Expected 0)`);

    console.log("Lower Third updated styling:");
    console.log(`  - BG: ${finalLt.style.bgColor} (Expected #052e16)`);
    console.log(`  - Font Family: ${finalLt.style.fontFamily} (Expected Share Tech Mono)`);
    console.log(`  - Corner Radius: ${finalLt.style.cornerRadiusPx}px (Expected 0)`);
    console.log(`  - Title Color: ${finalLt.style.titleColor} (Expected #22c55e)`);
    console.log(`  - Subtitle Color: ${finalLt.style.subtitleColor} (Expected #15803d)`);

    if (finalPb1.backgroundColor === "#000000" && finalPb1.fillColor === "#22c55e" && finalPb1.borderRadiusPx === 0) {
      console.log("\n[SUCCESS] Global theme token matrix overhaul validated perfectly!");
    } else {
      console.error("\n[FAIL] Global theme token matrix overhaul failed visual verification.");
    }

  } finally {
    // Cleanup: Delete the verification overlay
    console.log("\nCleaning up verification overlay...");
    await db.query(`DELETE FROM public.overlays WHERE id = $1`, [Number(overlayId)]);
    console.log("Cleanup complete!");
  }

  await db.end();
  console.log("\n--- Verification Completed ---");
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
