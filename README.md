# Fatigue — Hevy Analytics

Per-muscle fatigue, recovery and detraining analytics for a [Hevy](https://hevy.com) training
log, as an installable iPhone web app.

Hevy tells you how many sets a muscle got. This tells you which muscles are still cooked, when
they clear, and which ones are quietly detraining — using
[openGym](https://github.com/DuarteSantos8/openGym)'s recovery model over Hevy's data.

It **only reads**. Keep logging in Hevy exactly as you do now.

---

## Why there is no server

openGym is self-hosted: a Node backend, nginx, Docker, and a machine that has to stay on. That
backend exists to *store workouts and log you in*. Neither job is needed here — Hevy already
stores the workouts, and the entire fatigue engine is client-side pure functions.

The Hevy API also answers with `Access-Control-Allow-Origin: *` and permits the `api-key`
header, so the browser can call it directly with no proxy in between.

What is left is a static page. It deploys to any static host, costs nothing, and never needs a
machine running.

### Where the data lives

| | |
|---|---|
| **Hevy's servers** | The source of truth. Your account, your history, their backups. |
| **Your phone** | An IndexedDB cache so the app opens instantly and works offline. |
| **Anywhere else** | Nothing. The host serves files and sees no data. |

The app holds nothing Hevy does not. Clear it, reinstall it, switch phones — re-import and
everything is back. There is also an **Export backup** button for a JSON copy.

---

## Getting your training in

**CSV (any Hevy account).** In Hevy: Settings → Export & Import Data → Export Workout Data.
Save the file, open the app's **Data** tab, pick it. Re-importing later only adds what is new.

**API sync (needs Hevy Pro).** Get a key at `hevy.com/settings?developer`, paste it into the
Data tab. The first sync pulls everything; later syncs ask `/v1/workouts/events` for only what
changed, so an edited or deleted workout corrects itself. The key is stored on your device and
is sent to nobody but Hevy.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## Deploying to Cloudflare Pages

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name fatigue
```

Or connect the repo in the Cloudflare dashboard with build command `npm run build` and output
directory `dist`. Any static host works — Vercel, Netlify, GitHub Pages — nothing here is
Cloudflare-specific.

### Installing on the iPhone

Open the deployed URL in **Safari** (not Chrome — only Safari can install), then Share → **Add
to Home Screen**. It launches full-screen with no browser chrome, and home-screen PWAs are
exempt from Safari's 7-day storage eviction.

---

## Layout

```
src/
  vendor/          openGym, copied verbatim — do not edit
    lib/           recovery, muscles, effort, catalogue, CSV import
    components/    BodyMap
  lib/
    hevy.js        API client + Hevy -> openGym normaliser
    match.js       exercise-name overlay (see below)
    eta.js         recovery-time arithmetic
    store.js       IndexedDB persistence
  views/           Recovery, Volume, Strength, Effort, Data
```

`src/vendor/` is an unmodified copy of openGym's pure logic, so re-vendoring a newer upstream is
a straight file copy. Everything project-specific sits outside it and layers on top:

- **`match.js`** — openGym's matcher resolves ~76% of a typical Hevy vocabulary; the rest fall
  back to body-part weights, which is actively wrong (a "Bicep Curl (Dumbbell)" filed under
  "upper arms" fatigues your triceps). The overlay adds Hevy-specific aliases and two generic
  rewrites for its `Movement (Equipment)` convention, taking a 62-name sample from 47/62 to
  61/62. It runs only after upstream has already failed.
- Exercises that still cannot be identified are left **unattributed rather than guessed**, and
  listed back to you after every import. A wrong fatigue reading gets acted on; a missing one
  does not.
- **Build-time catalogue trim** (`vite.config.js`) drops the exercise instructions and media
  filenames nothing renders, cutting the bundle from 1.1 MB to 417 KB (100 KB gzipped) without
  touching the vendored source.

## What the numbers mean

- **Fatigue** — intensity-weighted volume per muscle, decaying on a 36-hour half-life, scored
  against your own recent sessions. A hard block raises the bar rather than pinning everything
  red. Bands: ready < 25%, recovering ≤ 50%, fatigued above.
- **Ready in** — solved from the decay curve, not estimated: the time for the accumulated
  stimulus to fall to the ready threshold.
- **Retained strength** — full for 14 days after a work set, then a 28-day half-life to a 50%
  floor. Low here means detraining, not tiredness — the opposite instruction to fatigue.
- **Effort** — aggregated in RIR internally and converted for display, so a history mixing RPE
  and RIR still draws one series. Averages are hidden below 5 rated sets.

## Licence and attribution

`src/vendor/` is from [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos,
**AGPL-3.0** — so this project is AGPL-3.0 too (see `LICENSE`). Personal use imposes nothing,
but if you put it on a public URL, publish the source to stay clean. Body geometry is from
MuscleMap by Melih Colpan (MIT); see `NOTICE-opengym.md`.

Not affiliated with Hevy or openGym.
