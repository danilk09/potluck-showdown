# Potluck Showdown

An Android app for running potluck cook-offs. Hosts create a themed challenge, guests claim a dish and share the recipe, everyone rates dishes anonymously, and winners earn a profile frame. Every recipe goes into each attendee's **recipe bank**.

- **Front end:** React 19 + React-Bootstrap (Bootstrap 5 Sass theme), React Router
- **Android:** Capacitor 8 wraps the same React build as a native Android app (min Android 10)
- **Web:** the same build deploys to Firebase Hosting, so invitees can join in a browser without installing anything
- **Backend:** Firebase Authentication (passwords are never stored by this app) and Cloud Firestore, with security rules that enforce the privacy requirements

## Quick start (no Firebase project needed)

With no Firebase keys in `.env`, the app connects to the local **Firebase Emulator Suite** (project `demo-potluck`).

```bash
npm install
npm run emulators          # terminal 1: Auth + Firestore emulators, UI at http://localhost:4000
npm run dev                # terminal 2: web app at http://localhost:5173
```

## Testing in Android Studio

**What you need installed:** [Android Studio](https://developer.android.com/studio) (with an emulator from
Device Manager) and [Node.js 22 or 24 LTS](https://nodejs.org). That's all: the Firebase CLI comes with
`npm install`, and the Firebase emulators use Android Studio's built-in Java if you don't have one.

**One-time setup (after cloning)**

1. In a terminal in the project folder, run `npm install`. This also generates the Android pieces Gradle needs.
   **Do this before opening Android Studio**; otherwise Gradle sync stops with a message asking you to.
2. In Android Studio choose **File → Open** and select the **`android`** folder (not the repo root).
   Let the Gradle sync finish. If Studio asks to install a missing SDK platform, accept.

> After pulling teammates' changes: if `package.json` changed, run `npm install` again. Code changes are picked up
> automatically when you press Run.

**Every testing session**

1. In a terminal in the project folder, start the local Firebase backend and leave it running:
   ```bash
   npm run emulators
   ```
2. *(First time, or to reset)* In a second terminal, load demo data:
   ```bash
   npm run seed
   ```
   This creates `you@example.com` / `password123` plus three other users, and potlucks in every phase:
   one you can vote in right now, one you can add a dish to, one you already won, and one to join with
   code `DUMPLING-3QZ`.
3. In Android Studio, pick your emulator in the device dropdown and press **Run ▶**.

Each Run automatically rebuilds the React app and packages it into the APK (the `buildWebAppDebug`
Gradle task), so you always test your latest code. Debug builds reach the Firebase emulators on your
computer through `10.0.2.2`. If they aren't running, the sign-in screen tells you.

**Tips**

- **Logs:** Logcat in Android Studio; filter by `Capacitor/Console` to see the app's `console.log` output.
- **Web inspector:** with the app open, visit `chrome://inspect` in desktop Chrome and click *inspect* under the
  emulator's WebView for full DevTools (elements, network, console).
- **Faster UI work:** `npm run dev` and open <http://localhost:5173> at a phone size in Chrome DevTools. Use Android
  Studio for device-specific checks (back button, share sheet, camera, safe areas).
- **Emulator data persists** between `npm run emulators` sessions (saved in `.emulator-data/` on exit).
  `npm run seed` wipes and reloads the demo data. The emulator UI at <http://localhost:4000> shows every account
  and document.
- **Each teammate's emulator data is separate.** The emulators run on your own computer, so your potlucks and
  accounts aren't visible to anyone else. To test *together* (e.g. one person hosts, others join from their own
  phones), connect everyone to one shared Firebase project (see [Connect a real Firebase project](#connect-a-real-firebase-project))
  and share the `.env` file privately (it's gitignored).
- **Testing two people at once:** sign in as `maya@example.com` in a browser (`npm run dev`) while you use
  `you@example.com` in the emulator. Changes appear live on both.
- **Physical phone:** set `VITE_EMULATOR_HOST` in `.env` to your computer's Wi-Fi IP and add `"host": "0.0.0.0"` to
  the `auth` and `firestore` entries in `firebase.json`, or connect a real Firebase project (below).

Command-line equivalents: `npm run android:apk` builds `android/app/build/outputs/apk/debug/app-debug.apk`;
`npm run android:run` builds and launches on a connected device.

## Connect a real Firebase project

1. Create a project at <https://console.firebase.google.com> (the free Spark plan is enough).
2. **Authentication → Sign-in method:** enable **Email/Password** and **Anonymous** (Anonymous is used for browser guests).
3. **Firestore Database:** create a database.
4. **Project settings → Your apps → Web app:** copy the config into `.env` (see `.env.example`).
5. Put your project id in `.firebaserc`, then deploy the rules and the web version:
   ```bash
   npm run deploy:rules
   npm run deploy:web
   ```
6. Set `VITE_PUBLIC_WEB_URL` to your Hosting URL and update `app_link_host` in
   `android/app/src/main/res/values/strings.xml` to match. For Android App Links (invite links that open the
   app when it's installed), put your signing key's SHA-256 in `public/.well-known/assetlinks.json`.
7. Rebuild the APK: `npm run android:apk`.

## How the requirements map to the code

| Requirement | Where |
| --- | --- |
| Android app | `android/` (Capacitor), hardware back button + deep links in `src/App.jsx`, Android share sheet/haptics in `src/lib/platform.js` |
| Join without downloading | Invite links point to the web build. `src/pages/Join.jsx` lets signed-out visitors join as a **guest** (Firebase anonymous auth). Guests can later save a full account without losing data (`upgradeGuest`) |
| Outsourced password security | Firebase Authentication (`src/hooks/AuthContext.jsx`) |
| Recipes visible only to attendees | `firestore.rules` → `match /potlucks/{pid}/dishes` requires membership; `src/pages/RecipeBank.jsx` |
| Recipe search | `src/pages/RecipeBank.jsx`: search by dish, ingredient, person, or potluck; filter by dietary label; sort |
| No browsing other profiles | `publicProfiles` allows `get` by id but **never** `list`; there is no profile page for other people |
| Flex your wins | Gold/silver/bronze/host **profile frames** shown on every avatar. Rules only accept a frame that a finished potluck's podium backs (`validFrame`) |
| Anonymous ratings | Only the voter can read their ballot. A vote must atomically add exactly its scores to the dish totals (`validVote`) |

## Data model (Firestore)

```
users/{uid}                     private: email, timestamps (owner only)
publicProfiles/{uid}            displayName, photoURL, frame {tier, potluckId}
inviteCodes/{CODE}              potluckId, hostId (unique codes)
potlucks/{pid}                  details, format, scoring[], dishCategories[], memberIds[], status, podium[], results
potlucks/{pid}/dishes/{uid}     one dish per member: recipe, ingredients, allergens, dietary, photo ref,
                                scoreSums{c0..c3}, ratingCount, likedBy[]
potlucks/{pid}/ratings/{dish_uid}  anonymous ballot, readable only by the voter
potlucks/{pid}/images/{id}      compressed photos (members only)
```

## Tests

```bash
npm test             # scoring, invite codes, phases, frames (Vitest)
npm run test:rules   # 29 security-rule tests (starts its own emulator; stop `npm run emulators` first)
npm run lint
```

## Project layout

```
src/
  pages/        one file per screen (Home, PotluckForm, Join, EventDetail, DishForm, Feed, RateDish, Results, RecipeBank, Events, Profile, Auth)
  components/   Avatar (with frames), Layout (top + bottom nav), PhotoPicker, InviteSheet (QR), shared UI
  data/         api.js (all reads/writes), builders.js (document shapes, shared with the rules tests)
  hooks/        auth context, live Firestore hooks, profile cache
  lib/          scoring, formats, phases, frames, dates, images, Android/platform helpers
  styles/       Bootstrap theme (colors from the Figma drafts)
firestore.rules  security rules
android/        native Android project
```
