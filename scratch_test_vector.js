import { searchIcons, getIconSvgAsPaths } from './services/vectorLibrary.js';
import * as cheerio from 'cheerio';

async function test() {
  console.log('Searching...');
  const icons = await searchIcons('gamepad', 2);
  console.log('Found:', icons);

  if (icons.length > 0) {
    console.log('Fetching', icons[0]);
    const res = await fetch(`https://api.iconify.design/${icons[0]}.svg`);
    const svgStr = await res.text();
    console.log('RAW SVG:', svgStr);
    const $ = cheerio.load(svgStr, { xmlMode: true });
    console.log('Paths count:', $('path').length);

    const result = await getIconSvgAsPaths(icons[0]);
    console.log('Paths:', result.paths.length);
    console.log('First path commands:', result.paths[0]?.commands?.slice(0, 5));
  }
}

test().catch(console.error);
