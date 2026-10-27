import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

async function main() {
  if (!convexUrl) {
    console.error('\n✖ Missing EXPO_PUBLIC_CONVEX_URL. Please set it in your .env file or run `npx convex dev` first.\n');
    process.exit(1);
  }

  console.log(`Connecting to Convex at: ${convexUrl}…`);
  const client = new ConvexHttpClient(convexUrl);

  console.log('Seeding demo database with default data (Alex, Maya, Leo, Priya + 4 potlucks + dishes + ratings)…');
  const result: any = await client.mutation(api.seed.defaultSeed, {});

  console.log(`
✔ Demo data ready on Convex!

${result?.message || 'Demo data generated.'}

Sign in credentials:
  Email:    you@example.com
  Password: password123
(Other accounts: maya@example.com, leo@example.com, priya@example.com, same password.)
`);
}

main().catch((err) => {
  console.error('\n✖ Seeding failed:', err.message);
  process.exit(1);
});
