// src/shared/overlayRenderer/heroPatternLib.ts

export interface HeroPatternDef {
  name: string;
  label: string;
  width: number;
  height: number;
  svgContent: (fgColor: string, fgOpacity: number) => string;
}

export const HERO_PATTERNS: Record<string, HeroPatternDef> = {
  topography: {
    name: "topography",
    label: "Topography",
    width: 340,
    height: 340,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1">
        <path d="M-10 10c20-5 35 15 60 5s30-20 50-10s45 25 70 15s35-15 60-15s45 15 70 5s40-10 50 10s45 15 60 5"/>
        <path d="M-10 40c30 10 45-15 70-5s35 25 60 10s45-15 70-15s45 25 70 15s35-25 60-15s40 10 60-10"/>
        <path d="M-10 80c20-10 45 15 70 5s35-25 60-15s45 20 70 10s45-20 70-10s35 15 60 5s40-15 60 10"/>
        <path d="M-10 120c30 15 45-25 70-10s35 20 60 10s45-25 70-5s45 15 70 15s35-20 60-10s40 15 60-5"/>
        <path d="M-10 160c20-15 45 10 70 10s35-20 60-15s45 25 70 15s45-15 70-20s35 25 60 15s40-10 60 5"/>
        <path d="M-10 200c30 5 45-15 70-5s35 25 60 20s45-15 70-10s45 15 70 5s35-25 60-15s40 20 60 0"/>
        <path d="M-10 240c20-10 45 20 70 10s35-25 60-20s45 15 70 10s45-15 70-5s35 25 60 10s40-20 60 5"/>
        <path d="M-10 280c30 15 45-20 70-10s35 15 60 5s45-25 70-15s45 20 70 10s35-15 60-5s40 10 60-10"/>
        <path d="M-10 320c20-15 45 10 70 5s35-15 60-10s45 25 70 20s45-20 70-15s35 10 60 5s40-5 60 10"/>
      </g>
    `
  },
  hexagons: {
    name: "hexagons",
    label: "Hexagons",
    width: 28,
    height: 49,
    svgContent: (fg, fgOp) => `
      <path d="M14 0 L28 8 L28 24 L14 32 L0 24 L0 8 Z M14 49 L28 41 L28 25 L14 17 L0 25 L0 41 Z" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  circuitBoard: {
    name: "circuitBoard",
    label: "Circuit Board",
    width: 100,
    height: 100,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1">
        <path d="M0 50h40l10 10v30 M100 50h-40l-10-10v-30"/>
        <path d="M50 0v20l10 10h40 M50 100v-20l-10-10h-40"/>
        <circle cx="50" cy="30" r="3" fill="none"/>
        <circle cx="50" cy="70" r="3" fill="none"/>
        <circle cx="40" cy="50" r="2" fill="${fg}" fill-opacity="${fgOp}"/>
        <circle cx="60" cy="50" r="2" fill="${fg}" fill-opacity="${fgOp}"/>
        <circle cx="10" cy="10" r="3" fill="none"/>
        <path d="M10 13v15l15 15"/>
        <circle cx="25" cy="43" r="2" fill="${fg}" fill-opacity="${fgOp}"/>
        <circle cx="90" cy="90" r="3" fill="none"/>
        <path d="M90 87v-15l-15-15"/>
        <circle cx="75" cy="57" r="2" fill="${fg}" fill-opacity="${fgOp}"/>
      </g>
    `
  },
  jigsaw: {
    name: "jigsaw",
    label: "Jigsaw Puzzle",
    width: 44,
    height: 44,
    svgContent: (fg, fgOp) => `
      <path d="M0 22 C6 22 8 14 8 14 C8 14 11 12 14 15 C17 18 15 22 22 22 C29 22 27 18 30 15 C33 12 36 14 36 14 C36 14 38 22 44 22 M22 0 C22 6 14 8 14 8 C14 8 12 11 15 14 C18 17 22 15 22 22 C22 29 18 27 15 30 C12 33 14 36 14 36 C14 36 22 38 22 44" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  rain: {
    name: "rain",
    label: "Rain",
    width: 20,
    height: 40,
    svgContent: (fg, fgOp) => `
      <line x1="2" y1="2" x2="18" y2="38" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5" stroke-linecap="round"/>
    `
  },
  stripes: {
    name: "stripes",
    label: "Diagonal Stripes",
    width: 40,
    height: 40,
    svgContent: (fg, fgOp) => `
      <path d="M-10 10 L10 -10 M0 40 L40 0 M30 50 L50 30" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="4"/>
    `
  },
  zigZag: {
    name: "zigZag",
    label: "Zig Zag",
    width: 40,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M0 10 L10 0 L20 10 L30 0 L40 10 M0 20 L10 10 L20 20 L30 10 L40 20" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5"/>
    `
  },
  polkaDots: {
    name: "polkaDots",
    label: "Polka Dots",
    width: 20,
    height: 20,
    svgContent: (fg, fgOp) => `
      <circle cx="5" cy="5" r="3" fill="${fg}" fill-opacity="${fgOp}"/>
      <circle cx="15" cy="15" r="3" fill="${fg}" fill-opacity="${fgOp}"/>
    `
  },
  grid: {
    name: "grid",
    label: "Engineering Grid",
    width: 20,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  chevrons: {
    name: "chevrons",
    label: "Chevrons",
    width: 20,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M0 5 L10 12 L20 5 M0 12 L10 19 L20 12" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `
  },
  anchors: {
    name: "anchors",
    label: "Anchors",
    width: 40,
    height: 40,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5">
        <circle cx="20" cy="8" r="3"/>
        <line x1="20" y1="11" x2="20" y2="28"/>
        <line x1="14" y1="16" x2="26" y2="16"/>
        <path d="M8 20 C8 32 32 32 32 20 M8 20 L5 22 M32 20 L35 22" stroke-linecap="round"/>
      </g>
    `
  },
  bubbles: {
    name: "bubbles",
    label: "Bubbles",
    width: 40,
    height: 40,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.2">
        <circle cx="12" cy="12" r="6"/>
        <circle cx="28" cy="28" r="8"/>
        <circle cx="30" cy="10" r="3"/>
        <circle cx="10" cy="32" r="4"/>
      </g>
    `
  },
  diamonds: {
    name: "diamonds",
    label: "Diamonds",
    width: 30,
    height: 50,
    svgContent: (fg, fgOp) => `
      <path d="M15 0 L30 25 L15 50 L0 25 Z" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  overlappingCircles: {
    name: "overlappingCircles",
    label: "Overlapping Circles",
    width: 40,
    height: 40,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1">
        <circle cx="0" cy="0" r="20"/>
        <circle cx="40" cy="0" r="20"/>
        <circle cx="0" cy="40" r="20"/>
        <circle cx="40" cy="40" r="20"/>
        <circle cx="20" cy="20" r="20"/>
      </g>
    `
  },
  brick: {
    name: "brick",
    label: "Brick Wall",
    width: 40,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M0 0 L40 0 40 20 0 20 Z M20 0 L20 20 M0 10 L40 10" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  architect: {
    name: "architect",
    label: "Architect Draft",
    width: 50,
    height: 50,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="0.8">
        <line x1="0" y1="10" x2="50" y2="10"/>
        <line x1="0" y1="40" x2="50" y2="40"/>
        <line x1="10" y1="0" x2="10" y2="50"/>
        <line x1="40" y1="0" x2="40" y2="50"/>
        <circle cx="25" cy="25" r="12"/>
        <line x1="0" y1="0" x2="50" y2="50"/>
        <line x1="50" y1="0" x2="0" y2="50"/>
      </g>
    `
  },
  wiggle: {
    name: "wiggle",
    label: "Sinusoidal Waves",
    width: 40,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M0 5 Q10 0 20 5 T40 5 M0 15 Q10 10 20 15 T40 15" fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5" stroke-linecap="round"/>
    `
  },
  plusSigns: {
    name: "plusSigns",
    label: "Plus Signs",
    width: 20,
    height: 20,
    svgContent: (fg, fgOp) => `
      <path d="M5 2 v6 M2 5 h6 M15 12 v6 M12 15 h6" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5" stroke-linecap="round"/>
    `
  },
  crosses: {
    name: "crosses",
    label: "Geometric Crosses",
    width: 24,
    height: 24,
    svgContent: (fg, fgOp) => `
      <path d="M3 3 L9 9 M9 3 L3 9 M15 15 L21 21 M21 15 L15 21" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1.5" stroke-linecap="round"/>
    `
  },
  isometricCubes: {
    name: "isometricCubes",
    label: "Isometric Cubes",
    width: 30,
    height: 52,
    svgContent: (fg, fgOp) => `
      <g fill="none" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1" stroke-linejoin="round">
        <path d="M15 0 L30 8.6 L30 26 L15 34.6 L0 26 L0 8.6 Z"/>
        <path d="M15 34.6 L15 52 L30 43.4 L30 26 L15 17.3 L0 26 L0 43.4 Z"/>
        <path d="M15 0 L15 17.3 M0 8.6 L15 17.3 L30 8.6 M15 34.6 L15 17.3 M0 26 L15 17.3 L30 26 M15 52 L15 34.6"/>
      </g>
    `
  },
  verticalLines: {
    name: "verticalLines",
    label: "Vertical Lines",
    width: 20,
    height: 20,
    svgContent: (fg, fgOp) => `
      <line x1="10" y1="0" x2="10" y2="20" stroke="${fg}" stroke-opacity="${fgOp}" stroke-width="1"/>
    `
  },
  stars: {
    name: "stars",
    label: "Stars",
    width: 40,
    height: 40,
    svgContent: (fg, fgOp) => `
      <g fill="${fg}" fill-opacity="${fgOp}">
        <path d="M10 2 L12 7 L17 7 L13 10 L15 15 L10 12 L5 15 L7 10 L3 7 L8 7 Z"/>
        <path d="M30 22 L31.5 25.5 L35 25.5 L32 27.5 L33.5 31 L30 29 L26.5 31 L28 27.5 L25 25.5 L28.5 25.5 Z"/>
      </g>
    `
  }
};

export const HERO_PATTERNS_LIST = Object.values(HERO_PATTERNS);

export function generateHeroPatternSrc(
  patternName: string,
  foregroundColor: string,
  foregroundOpacity: number,
  backgroundColor: string,
  backgroundOpacity: number
): string {
  const pattern = HERO_PATTERNS[patternName] || HERO_PATTERNS.topography;
  
  const bgRect = backgroundOpacity > 0
    ? `<rect width="100%" height="100%" fill="${backgroundColor}" fill-opacity="${backgroundOpacity}"/>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pattern.width}" height="${pattern.height}" viewBox="0 0 ${pattern.width} ${pattern.height}">${bgRect}${pattern.svgContent(foregroundColor, foregroundOpacity)}</svg>`;
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
