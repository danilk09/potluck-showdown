// Runs the project's Firebase CLI (installed by `npm install`) with a Java runtime.
// The Firestore emulator needs Java 21+. If `java` isn't on the PATH, this falls
// back to the Java that ships inside Android Studio, so teammates who only
// installed Android Studio don't need a separate JDK.
//
//   node scripts/firebase.mjs <firebase args...>
import { existsSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

function javaMajor(javaBin) {
  // No shell: java is a real executable, and a shell would split "C:\Program Files\...".
  const res = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const m = `${res.stderr}${res.stdout}`.match(/version "(\d+)/);
  return m ? Number(m[1]) : 0;
}

function androidStudioJavaDirs() {
  const home = homedir();
  const dirs = [
    process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin'),
    'C:\\Program Files\\Android\\Android Studio\\jbr\\bin',
    join(home, 'AppData', 'Local', 'Programs', 'Android Studio', 'jbr', 'bin'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin',
    join(home, 'Applications', 'Android Studio.app', 'Contents', 'jbr', 'Contents', 'Home', 'bin'),
    '/opt/android-studio/jbr/bin',
    join(home, 'android-studio', 'jbr', 'bin'),
  ];
  // JetBrains Toolbox installs (versioned folders).
  const toolbox = join(home, 'AppData', 'Local', 'Programs');
  if (existsSync(toolbox)) {
    for (const d of readdirSync(toolbox)) if (/android studio/i.test(d)) dirs.push(join(toolbox, d, 'jbr', 'bin'));
  }
  return dirs.filter(Boolean);
}

const env = { ...process.env };
// Prefer the project's own Firebase CLI (node_modules/.bin) over any global install.
env.PATH = `${join(process.cwd(), 'node_modules', '.bin')}${delimiter}${env.PATH ?? env.Path ?? ''}`;
if (process.platform === 'win32') env.Path = env.PATH;

if (javaMajor('java') < 21) {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const dir = androidStudioJavaDirs().find((d) => existsSync(join(d, exe)) && javaMajor(join(d, exe)) >= 21);
  if (dir) {
    env.PATH = `${dir}${delimiter}${env.PATH}`;
    if (process.platform === 'win32') env.Path = env.PATH;
    console.log(`Using Java from ${dir}`);
  } else {
    console.error('✖ The Firebase emulators need Java 21 or newer. Install Android Studio or a JDK (https://adoptium.net), then try again.');
    process.exit(1);
  }
}

// shell: true is needed on Windows (firebase.cmd); quote args so "vitest run x" stays one argument.
const args = process.argv.slice(2).map((a) => (/\s/.test(a) ? `"${a}"` : a));
const child = spawn(['firebase', ...args].join(' '), { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
