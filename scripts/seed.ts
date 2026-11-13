// Fills your dev deployment with demo data. The seed function is internal (it
// wipes the database), so it runs through the Convex CLI with your deploy
// credentials instead of over the public client API.
import { execSync } from 'node:child_process';

console.log('Seeding demo database (Alex, Maya, Leo, Priya + 4 potlucks + dishes + ratings)…');
try {
  execSync('npx convex run seedDemo:run', { stdio: 'inherit' });
} catch {
  console.error('\n✖ Seeding failed. Run `npx convex dev` first so the CLI knows your dev deployment.\n');
  process.exit(1);
}

console.log(`
✔ Demo data ready on Convex!

Sign in credentials:
  Email:    you@example.com
  Password: password123
(Other accounts: maya@example.com, leo@example.com, priya@example.com, same password.)
`);
