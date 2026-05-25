/**
 * Local Curated SVG Motif Library (Scrapbot 2.0 Subsystem)
 * 
 * Contains hand-crafted, high-fidelity, coordinate-independent SVGs with a standard
 * 100x100 viewBox. Intercepted by vectorLibrary.js to bypass external API lookups.
 */

export const MOTIFS = {
  "motif:raven": `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M50,15 C46,16 43,24 38,34 C24,38 7,48 5,62 C15,62 28,52 38,43 C40,53 44,72 44,88 L50,78 L56,88 C56,72 60,53 62,43 C72,52 85,62 95,62 C93,48 76,38 62,34 C57,24 54,16 50,15 Z" fill="currentColor" />
    <path d="M43,30 L45,35 L40,34 Z M57,30 L55,35 L60,34 Z" fill="#000000" opacity="0.3" />
  </svg>`,

  "motif:anchor": `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <!-- Anchor Ring at top -->
    <circle cx="50" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="4" />
    <!-- Stock (crossbar) -->
    <path d="M25,28 L75,28" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
    <!-- Center shank (shaft) -->
    <path d="M50,19 L50,76" stroke="currentColor" stroke-width="6" stroke-linecap="square" />
    <!-- Main symmetrical curved arms -->
    <path d="M22,54 C22,68 28,78 50,78 C72,78 78,68 78,54" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
    <!-- Left fluke tip -->
    <path d="M22,56 L15,48 L27,48 Z" fill="currentColor" />
    <!-- Right fluke tip -->
    <path d="M78,56 L85,48 L73,48 Z" fill="currentColor" />
    <!-- Decorative center ring/bead -->
    <circle cx="50" cy="46" r="3" fill="currentColor" />
  </svg>`,

  "motif:cyber-ring": `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer dashed technical circle -->
    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="14 6 3 6" />
    <!-- Middle ticking/radar track -->
    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1 4" />
    <!-- Inner thick solid-segmented ring -->
    <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 15 10 15" />
    <!-- Outer technical corner ticks / crosshairs -->
    <path d="M50,2 L50,10 M50,90 L50,98 M2,50 L10,50 M90,50 L98,50" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <!-- Inner crosshair target cross -->
    <path d="M45,50 L55,50 M50,45 L50,55" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    <!-- Symmetrical peripheral accent dots -->
    <circle cx="18" cy="18" r="1.5" fill="currentColor" />
    <circle cx="82" cy="18" r="1.5" fill="currentColor" />
    <circle cx="18" cy="82" r="1.5" fill="currentColor" />
    <circle cx="82" cy="82" r="1.5" fill="currentColor" />
  </svg>`,

  "motif:cozy-mug": `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <!-- Mug Body -->
    <path d="M32,38 C32,38 30,72 32,74 C34,76 66,76 68,74 C70,72 68,38 68,38 Z" fill="currentColor" />
    <!-- Mug Rim Highlight -->
    <ellipse cx="50" cy="38" rx="18" ry="4" fill="currentColor" opacity="0.8" />
    <!-- Mug Handle -->
    <path d="M68,45 C75,45 80,48 80,54 C80,60 75,63 68,63" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" />
    <!-- Cozy Steaming Ripples -->
    <path d="M42,26 C42,21 46,21 46,16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <path d="M50,28 C50,22 54,22 54,16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <path d="M58,26 C58,21 62,21 62,16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  </svg>`
};

/**
 * Retrieves the raw, hand-crafted SVG string for a given local motif ID.
 * @param {string} motifId - The motif ID starting with 'motif:' (e.g. 'motif:raven')
 * @returns {string|null} The raw SVG string, or null if not found.
 */
export function getMotifSvg(motifId) {
  return MOTIFS[motifId] || null;
}

export default { MOTIFS, getMotifSvg };
