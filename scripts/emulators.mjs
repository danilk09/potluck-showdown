// Starts the Firebase Auth + Firestore emulators and keeps their data between
// runs (in .emulator-data/), so accounts you create while testing survive a restart.
// Stop with Ctrl+C; data is saved on exit. Delete .emulator-data/ for a clean slate.
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dir = '.emulator-data';
mkdirSync(dir, { recursive: true });

const args = ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-potluck', `--export-on-exit=${dir}`];
// firebase-tools refuses to import a folder that has never been exported to.
if (existsSync(`${dir}/firebase-export-metadata.json`)) args.push(`--import=${dir}`);

// scripts/firebase.mjs supplies the local Firebase CLI and a Java runtime (Android Studio's if needed).
const child = spawn(process.execPath, ['scripts/firebase.mjs', ...args], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
