// Renders the app logo (SVG) into the PNGs used by the web manifest and by
// @capacitor/assets to generate Android launcher icons + splash screens.
// Usage: npm run icons
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const CORAL = '#F2553A';
const CREAM = '#FFF7F2';

// A steaming pot with a gold star: the "showdown" in potluck.
const mark = `
  <g fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round">
    <path d="M410 300c-24-34 24-56 0-92"/><path d="M512 286c-24-34 24-56 0-92"/><path d="M614 300c-24-34 24-56 0-92"/>
  </g>
  <rect x="300" y="430" width="424" height="270" rx="70" fill="#fff"/>
  <rect x="270" y="392" width="484" height="62" rx="31" fill="#fff"/>
  <rect x="230" y="480" width="70" height="44" rx="22" fill="#fff"/>
  <rect x="724" y="480" width="70" height="44" rx="22" fill="#fff"/>
  <rect x="476" y="356" width="72" height="44" rx="18" fill="#fff"/>
  <path d="M512 492l25 51 56 8-41 40 10 56-50-27-50 27 10-56-41-40 56-8z" fill="#FFC64B"/>`;

const svg = ({ bg = CORAL, size = 1024, scale = 1, rounded = true } = {}) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" ${rounded ? 'rx="220"' : ''} fill="${bg}"/>` : ''}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -530)">${mark}</g>
</svg>`);

const splash = (dark) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${dark ? '#221B17' : CREAM}"/>
  <g transform="translate(1066 1066) scale(0.586)">
    <rect width="1024" height="1024" rx="220" fill="${CORAL}"/>
    <g transform="translate(512 512) translate(-512 -530)">${mark}</g>
  </g>
</svg>`);

mkdirSync('assets', { recursive: true });
mkdirSync('public/icons', { recursive: true });

await sharp(svg({ rounded: false })).png().toFile('assets/icon-only.png');
// Adaptive icon: foreground mark inside the 66% safe zone, solid background layer.
await sharp(svg({ bg: null, scale: 0.62 })).png().toFile('assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: CORAL } }).png().toFile('assets/icon-background.png');
await sharp(splash(false)).png().toFile('assets/splash.png');
await sharp(splash(true)).png().toFile('assets/splash-dark.png');

await sharp(svg()).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(svg()).resize(192).png().toFile('public/icons/icon-192.png');
console.log('Icons written to assets/ and public/icons/');
