// Runs after `expo export --platform web`. Link previews (iMessage, WhatsApp,
// Facebook…) need the preview image as a full URL, so this rewrites the
// relative paths in dist/index.html using EXPO_PUBLIC_WEB_URL.
// Usage: npm run build:web
import { readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';

const file = 'dist/index.html';
const base = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

if (!base || base.includes('YOUR-PROJECT')) {
  console.warn('EXPO_PUBLIC_WEB_URL is not set, so invite link previews use a relative image path. Some apps will skip the picture.');
} else {
  const html = readFileSync(file, 'utf8').replace(/content="\/og-invite\.png"/g, `content="${base}/og-invite.png"`);
  writeFileSync(file, html);
  console.log(`Invite link previews point to ${base}/og-invite.png`);
}
