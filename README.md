# Potluck Showdown

A mobile app for running potluck cook-offs. Hosts create a themed challenge, guests claim a dish and share the recipe, everyone rates dishes anonymously, and winners earn a profile frame. Every recipe goes into each attendee's **recipe bank**.

- **App:** React Native with [Expo](https://expo.dev) (SDK 58) and Expo Router. 100% TypeScript. One codebase runs on Android, iOS, and the web
- **Testing:** open it in **Expo Go** on your phone. No Android Studio or Xcode needed
- **Web:** the same code exports to a responsive web app (`npm run build:web`), so invitees can join in a browser without installing anything
- **Backend:** [Convex](https://convex.dev) reactive backend (`convex/schema.ts`, `convex/users.ts`, `convex/potlucks.ts`, `convex/dishes.ts`, `convex/voting.ts`, `convex/seed.ts`). Real-time queries and mutations with full type safety

## Quick start: test on your phone with Expo Go

**What you need:** [Node.js 22 or 24 LTS](https://nodejs.org) and the **Expo Go** app on your phone
([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) ·
[iOS](https://apps.apple.com/app/expo-go/id982107779)). Your phone and computer must be on the **same Wi-Fi network**.

```bash
npm install
npx convex dev             # terminal 1: runs local Convex backend
npm run seed               # terminal 2: seeds demo accounts + potlucks
npm start                  # terminal 2: starts Expo and prints a QR code
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). The app opens on your phone and talks to your Convex backend.

Sign in as `you@example.com` / `password123`. The seed creates accounts and potlucks in every phase:
one you can vote in right now, one you can add a dish to, one you already won, and one to join with code
`DUMPLING-3QZ`.

**Other ways to run it**

- `npm run android` opens the app in Expo Go on a running Android Studio emulator.
- `npm run ios` does the same on the iOS Simulator (macOS only).
- `npm run web` opens the web version at <http://localhost:8081>.
- Press `r` in the Expo terminal to reload, `m` for the developer menu. Saving a file updates the app instantly.

**Tips**

- **Logs:** `console.log` output appears in the terminal running `npm start`. Press `j` there to open the debugger.
- **Testing two people at once:** sign in as `maya@example.com` in a browser (`npm run web`) while you use
  `you@example.com` on your phone. Changes appear live on both.
- **Invite links while testing:** with no `EXPO_PUBLIC_WEB_URL` set, invite links and QR codes are `exp://` links
  that open the app in Expo Go on another phone on the same Wi-Fi.

## How the requirements map to the code

| Requirement | Where |
| --- | --- |
| Mobile app | React Native screens in `src/app/` (Expo Router); native share sheet, haptics, camera, and date pickers in `src/lib/platform.ts`, `src/lib/images.ts`, `src/components/DateTimeField.tsx` |
| Join without downloading | Invite links point to the web build. `src/components/JoinScreen.tsx` lets signed-out visitors join as a **guest** (`signInGuest`). Guests can later save a full account without losing data (`upgradeGuest`) |
| Secure user sessions | Token-backed authentication via Convex (`convex/users.ts`, `src/hooks/AuthContext.tsx`) |
| Recipes visible only to attendees | Query access checks in Convex (`convex/dishes.ts`); displayed in `src/app/(app)/(tabs)/recipes.tsx` |
| Recipe search | `src/app/(app)/(tabs)/recipes.tsx`: search by dish, ingredient, person, or potluck; filter by dietary label; sort |
| No browsing other profiles | Convex query returns public profile by id, no listing of all user accounts |
| Flex your wins | Gold/silver/bronze/host **profile frames** shown on every avatar. Profiles only equip a frame backed by a finished potluck |
| Anonymous ratings | Ballots recorded anonymously with aggregated ratings on dish documents (`convex/voting.ts`) |

## Data model (Convex Schema)

Defined in `convex/schema.ts`:
- `users`: email, password, displayName, photoURL, frame, isGuest, sessionToken, timestamps
- `potlucks`: title, theme, description, format, formatDetail, startsAt, location, maxGuests, scoring, dishCategories, memberIds, hostId, inviteCode, status, podium, results
- `dishes`: potluckId, authorId, categoryId, name, serves, ingredients, steps, allergens, dietary, prepMinutes, calories, photo, recipePhoto, scoreSums, ratingCount, likedBy
- `ballots`: potluckId, dishId, userId, scores, createdAt
- `inviteCodes`: code, potluckId, hostId, createdAt
- `images`: potluckId, ownerId, data, createdAt

## Tests & Quality

```bash
npm test             # scoring, invite codes, phases, frames (Vitest)
npm run typecheck    # TypeScript verification across app & Convex functions
npm run lint         # oxlint code checks
```

## Project layout

```
convex/         Convex backend schema, queries, mutations, seed
src/
  app/          screens, one file per route (Expo Router)
    (auth)/       welcome, sign in, sign up, reset password (signed-out only)
    (app)/        signed-in screens
      (tabs)/       bottom tabs: Home, Feed, Recipes, Events, Profile
      potlucks/     event details, edit, add dish, dish recipe, rate dish, results
    join/         join with an invite code (works signed in or as a new guest)
  components/   shared UI kit (ui.tsx), Avatar (with frames), PhotoPicker, DateTimeField, InviteSheet (QR), forms
  data/         api.ts (reads/writes via Convex), builders.ts
  hooks/        auth context, Convex reactive hooks, profile cache
  lib/          scoring, formats, phases, frames, dates, images, platform helpers
  theme.ts      colors and typography
app.json        Expo app config (name, icons, Android package, permissions)
tsconfig.json  TypeScript configuration
```
