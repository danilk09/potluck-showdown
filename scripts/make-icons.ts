// Renders the app logo (SVG) into the PNGs app.json uses for the app icon,
// Android adaptive icon, splash screen, and web favicon, plus the picture
// shown on invite-link previews (public/og-invite.png).
// Usage: npm run icons
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const CORAL = '#F2553A';

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

type SvgOptions = {
  bg?: string | null;
  size?: number;
  scale?: number;
  rounded?: boolean;
};

const svg = ({ bg = CORAL, size = 1024, scale = 1, rounded = true }: SvgOptions = {}) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" ${rounded ? 'rx="220"' : ''} fill="${bg}"/>` : ''}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -530)">${mark}</g>
</svg>`);

async function run() {
  mkdirSync('assets', { recursive: true });

  await sharp(svg({ rounded: false })).png().toFile('assets/icon-only.png');
  // Adaptive icon: foreground mark inside the 66% safe zone (app.json supplies the coral background).
  await sharp(svg({ bg: null, scale: 0.62 })).png().toFile('assets/icon-foreground.png');
  await sharp(svg()).resize(192).png().toFile('assets/favicon.png');
  console.log('Icons written to assets/');

  // Link preview card (1200x630) shown when an invite link is pasted into a chat.
  mkdirSync('public', { recursive: true });
  const card = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CORAL}"/><stop offset="1" stop-color="#F0703F"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g transform="translate(90 115) scale(0.42)">${mark}</g>
  <g font-family="Arial, Helvetica, sans-serif" fill="#fff">
    <text x="530" y="250" font-size="40" font-weight="700" fill="#FFE08A" letter-spacing="3">YOU'RE INVITED</text>
    <text x="530" y="335" font-size="72" font-weight="800">Come join</text>
    <text x="530" y="415" font-size="72" font-weight="800">my potluck!</text>
    <text x="530" y="480" font-size="28">Bring a dish · Rate the food · Crown a winner</text>
  </g>
  <text x="600" y="585" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#fff" opacity="0.85">Potluck Showdown · join in your browser, no app needed</text>
</svg>`);
  await sharp(card).png().toFile('public/og-invite.png');
  console.log('Invite preview written to public/og-invite.png');
}

run().catch(console.error);
