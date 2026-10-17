# Potluck Showdown

A mobile app for running potluck cook-offs. Hosts create a themed challenge, guests claim a dish and share the recipe, everyone rates dishes anonymously, and winners earn a profile frame. Every recipe goes into each attendee's **recipe bank**.

- **App:** React Native with [Expo](https://expo.dev) (SDK 57) and Expo Router. One codebase runs on Android, iOS, and the web
- **Testing:** open it in **Expo Go** on your phone. No Android Studio or Xcode needed
- **Web:** the same code exports to a website (Firebase Hosting), so invitees can join in a browser without installing anything
- **Backend:** Firebase Authentication (passwords are never stored by this app) and Cloud Firestore, with security rules that enforce the privacy requirements

## Quick start: test on your phone with Expo Go

**What you need:** [Node.js 22 or 24 LTS](https://nodejs.org), Java 21+ for the Firebase emulators (the one inside
Android Studio works; see below), and the **Expo Go** app on your phone
([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) ·
[iOS](https://apps.apple.com/app/expo-go/id982107779)). Your phone and computer must be on the **same Wi-Fi network**.
Expo Go only runs one SDK version at a time: this project uses **SDK 57**, matching the Expo Go in the app stores. If
Expo Go says the project is incompatible after a store update, upgrade the project with
`npm install expo@^<new SDK> && npx expo install --fix`.

```bash
npm install
npm run emulators          # terminal 1: local Firebase (Auth + Firestore), UI at http://localhost:4000
npm run seed               # terminal 2, first time only: demo accounts + potlucks
npm start                  # terminal 2: starts Expo and prints a QR code
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). The app opens on your phone and talks to the
Firebase emulators on your computer automatically. It finds them at the same address Expo Go used to load the app.

Sign in as `you@example.com` / `password123`. The seed also creates three other users and potlucks in every phase:
one you can vote in right now, one you can add a dish to, one you already won, and one to join with code
`DUMPLING-3QZ`.

> **Windows:** the first time you run `npm run emulators`, Windows Firewall asks whether Java may accept connections.
> Allow it on **private networks**, or your phone can't reach the emulators. If the sign-in screen says it can't reach
> the emulators, this is almost always the cause (or the phone is on a different Wi-Fi / a guest network).

**Other ways to run it**

- `npm run android` opens the app in Expo Go on a running Android Studio emulator (Expo installs Expo Go for you).
- `npm run ios` does the same on the iOS Simulator (macOS only).
- `npm run web` opens the web version at <http://localhost:8081>.
- Press `r` in the Expo terminal to reload, `m` for the developer menu. Saving a file updates the app instantly.

**Tips**

- **Logs:** `console.log` output appears in the terminal running `npm start`. Press `j` there to open the debugger.
- **Emulator data persists** between `npm run emulators` sessions (saved in `.emulator-data/` when you stop it
  with **Ctrl+C**). Closing the terminal window instead skips the save, so if you've created test data you want to
  keep, run `npm run emulators:save` in another terminal first. `npm run seed` wipes and reloads the demo data. The
  emulator UI at <http://localhost:4000> shows every account and document.
- **Each teammate's emulator data is separate.** The emulators run on your own computer, so your potlucks and
  accounts aren't visible to anyone else. To test *together* (e.g. one person hosts, others join from their own
  phones), connect everyone to one shared Firebase project (see [Connect a real Firebase project](#connect-a-real-firebase-project))
  and share the `.env` file privately (it's gitignored).
- **Testing two people at once:** sign in as `maya@example.com` in a browser (`npm run web`) while you use
  `you@example.com` on your phone. Changes appear live on both.
- **Invite links while testing:** with no `EXPO_PUBLIC_WEB_URL` set, invite links and QR codes are `exp://` links
  that open the app in Expo Go on another phone on the same Wi-Fi.
- **Unusual networks:** if your Wi-Fi blocks phone-to-computer traffic, set `EXPO_PUBLIC_EMULATOR_HOST` in `.env`
  to your computer's IP address, or connect a real Firebase project. `npx expo start --tunnel` can load the app,
  but the phone still needs to reach the emulators directly.

## Connect a real Firebase project

1. Create a project at <https://console.firebase.google.com> (the free Spark plan is enough).
2. **Authentication → Sign-in method:** enable **Email/Password** and **Anonymous** (Anonymous is used for guests).
3. **Firestore Database:** create a database.
4. **Project settings → Your apps → Web app:** copy the config into `.env` (see `.env.example`). Restart `npm start`
   after editing `.env`.
5. Put your project id in `.firebaserc`, then deploy the rules and the web version:
   ```bash
   npm run deploy:rules
   npm run deploy:web
   ```
6. Set `EXPO_PUBLIC_WEB_URL` to your Hosting URL so invite links work for everyone.

## Building a standalone app

Expo Go is for development. To make an installable APK / App Store build, use
[EAS Build](https://docs.expo.dev/build/setup/) (`npx eas build -p android`), or run `npx expo prebuild` to
generate the native `android/` and `ios/` projects and open them in Android Studio / Xcode. Those folders are
generated, so they're gitignored. Universal links (`https://…/join/CODE` opening the installed app) need a
standalone build. Expo Go only handles `exp://` and `potluckshowdown://` links.

## How the requirements map to the code

| Requirement | Where |
| --- | --- |
| Mobile app | React Native screens in `src/app/` (Expo Router); native share sheet, haptics, camera, and date pickers in `src/lib/platform.js`, `src/lib/images.js`, `src/components/DateTimeField.jsx` |
| Join without downloading | Invite links point to the web build. `src/components/JoinScreen.jsx` lets signed-out visitors join as a **guest** (Firebase anonymous auth). Guests can later save a full account without losing data (`upgradeGuest`) |
| Outsourced password security | Firebase Authentication (`src/hooks/AuthContext.jsx`) |
| Recipes visible only to attendees | `firestore.rules` → `match /potlucks/{pid}/dishes` requires membership; `src/app/(app)/(tabs)/recipes.jsx` |
| Recipe search | `src/app/(app)/(tabs)/recipes.jsx`: search by dish, ingredient, person, or potluck; filter by dietary label; sort |
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
npm run test:rules   # security-rule tests (starts its own emulator; stop `npm run emulators` first)
npm run lint
```

## Project layout

```
src/
  app/          screens, one file per route (Expo Router)
    (auth)/       welcome, sign in, sign up, reset password (signed-out only)
    (app)/        signed-in screens
      (tabs)/       bottom tabs: Home, Feed, Recipes, Events, Profile
      potlucks/     event details, edit, add dish, dish recipe, rate dish, results
    join/         join with an invite code (works signed in or as a new guest)
  components/   shared UI kit (ui.jsx), Avatar (with frames), PhotoPicker, DateTimeField, InviteSheet (QR), forms
  data/         api.js (all reads/writes), builders.js (document shapes, shared with the rules tests)
  hooks/        auth context, live Firestore hooks, profile cache
  lib/          scoring, formats, phases, frames, dates, images, platform helpers
  theme.js      colors and type styles (from the Figma drafts)
firestore.rules  security rules
app.json        Expo app config (name, icons, Android package, permissions)
```
