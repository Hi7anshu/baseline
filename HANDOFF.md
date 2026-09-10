# Handoff

Written 2026-09-07, updated 2026-09-07 after the first real week of use. Read this plus
`README.md` before changing anything.

**Live:** https://hi7anshu.github.io/baseline/ · **Repo:** `Hi7anshu/baseline` (public, AGPL-3.0)
· **Local:** `D:\opengym-hevy` (folder name predates the rename; the repo is `baseline`)

Everything below is committed, pushed and deployed. Working tree was clean at handoff.

---

## What this is, in one paragraph

Hitanshu logs training in **Hevy** and will keep doing so. Baseline is a **read-only** analytics
layer over that log: openGym's per-muscle fatigue and detraining model, plus body composition
and nutrition that Hevy either gates behind Pro or does not do at all. It is a static PWA on
GitHub Pages — **no server, no database, nothing that has to stay running**, which was a hard
constraint (he previously self-hosted openGym on a Linux box and disliked keeping it on).

Two facts make the no-server design possible. Verify both still hold before assuming it:

1. openGym's entire fatigue engine is **client-side pure functions** with no store or network
   coupling.
2. `api.hevyapp.com` sends `Access-Control-Allow-Origin: *` and allows the `api-key` header, so
   a browser can call it directly with no proxy.

---

## State of play

| Area | Status |
|---|---|
| Recovery (fatigue + retention, body map, grouped muscles) | Done |
| Recovery → Fuel lens (intake, load, and per-group conditions) | Done — reports, never scores |
| Training → Volume (sets/muscle, delt heads) | Done |
| Training → Strength (e1RM per lift, PRs, stalls) | Done |
| Training → Effort (RPE) | Done, hidden unless rated sets exist |
| Body (measurements, body fat, FFMI, trend charts, profile) | Done — all nine metrics chart |
| Fuel (macros, targets, Claude prompt) | Done |
| Data (CSV import, exercise identification, export **and restore**) | Done |
| Light / dark / system theme | Done — `lib/theme.js`, chosen under Data → Appearance |
| Training → Sessions (heatmap, weekly volume, the log itself) | Done |
| Recovery → Train today | Done |
| Recovery → Today: readiness ring + input breakdown | Done — see the rule below |
| Sleep diary + daily check-in (`views/Sleep.jsx`) | Done |
| Sleep/mood correlations (Sleep → Patterns) | Done, gated at 8 paired days |
| Claude digest (Data → Ask Claude about all of it) | Done — copy/paste, no API key |
| Linked export file + one-button refresh | Done **where the browser allows it** — see below |
| Stale-data warning | Done — `lib/freshness.js`, banner on Recovery, note on Data |
| Hevy API sync | **Written, never run against a real key** — he has no Pro, see below |
| Body-weight import | Done — tested against his real file 2026-09-07 |

### Hevy Pro: answered, and the answer is no

He confirmed on 2026-09-07 that he has no Pro key and cannot test the API path. So:

- The CSV export path is the only one in use. `lib/hevy.js` sync stays in the tree, untested,
  and activates if he ever upgrades — do not rip it out and do not build around it.
- `/v1/body_measurements` is likewise unavailable. Body weight came in through the file import,
  which means **the body-weight import path is now tested against a real file** and works.
- Stop asking him to check. It is settled until he says otherwise.

## The readiness ring, and the rule attached to it

Recovery leads with a Whoop-style dial. Whoop's number comes off a strap — heart-rate
variability, resting heart rate, measured sleep stages. **Baseline has no sensor of any kind.**
Its score is a weighted average of four things that were logged or modelled: sleep 40, muscles
30, fuel 15, mind 15, renormalised over whatever is present so a missing input costs confidence
rather than points.

The rule, which is not negotiable and is the reason the feature is defensible at all: **the ring
is never rendered without the breakdown underneath it.** Every component shows its own value, its
weight and a link to the screen it came from, and the ring's arcs are per-component — each input
fills its own slice in proportion to its own score, so the weak input is visible from across the
room. A dial made of self-report that looked like a sensor reading would be a lie of presentation,
and the number is the part people remember. If you ever find yourself adding a second screen that
shows the score alone, don't.

Where the weights came from: sleep first because it has the largest evidenced effect on next-day
function and because it is what he is here to fix; muscles second as the only modelled component;
fuel and mind smaller because they are coarser measurements, not because they matter less. They
are a judgement, they are stated in the UI as a judgement, and they are one constant
(`WEIGHTS` in `lib/readiness.js`) if they need revisiting.

## Sleep is a diary, not a tracker readout

`lib/sleep.js` records to-bed, got-up, minutes to fall asleep, wakings, minutes awake in the
night, and a 1–5 rating. Those are the fields of a standard sleep diary, and they are chosen
against the actual complaint: he has trouble getting to sleep and wakes in the night, which is a
*continuity* problem, and hours-slept is the number that says least about it. Efficiency (asleep
÷ in bed) is the headline for that reason — it separates "not enough sleep" from "nine hours in
bed, five asleep", which have opposite fixes.

Thresholds (`POOR_EFFICIENCY` 85%, `LONG_LATENCY` 30 min, `HIGH_WASO` 30 min) are the
conventional ones from sleep medicine, not invented here. The app says so, says it is not a
diagnosis, and points at a doctor for persistent insomnia — keep all three of those. The one piece
of advice it gives (shorten time in bed rather than going to bed earlier) is the standard first
move in sleep restriction, and it is worded as what the standard move is, not as a prescription.

The Patterns tab correlates sleep against next-day mood, energy and soreness. It is quarantined
on its own tab, needs 8 paired days, reports Pearson's r with the count, and says "moved
together" everywhere. Two weeks of one person's self-report cannot separate cause from
coincidence, and a bad week at work moves stress, sleep and mood together without any of them
causing the others. Do not upgrade that language.

## The Claude digest, and the API key question

He asked whether his Claude Pro subscription includes an API key. It does not — API access is
billed separately through the Anthropic console — and beyond that, **this app could not hold a
key even if he had one**: it is a static page in a public repo, so a key in client-side code
ships to every visitor, and there is no server to keep one on without breaking the constraint the
whole app exists under.

So `lib/digest.js` writes a markdown summary — readiness, sleep table, mood, training, fuel, body,
plus a footer explaining every model involved — and Data copies it to the clipboard with a
question attached. Nothing leaves the device until he pastes it. If a future session is asked for
"AI insights in the app", that is the answer, and the reasoning above is why.

## The linked file, and why it is not on his phone

He asked for the thing that obviously should exist: Hevy overwrites the same export file every
time, so Baseline ought to remember that path and re-read it on a button press.

That is exactly what the File System Access API does, and `lib/linked-file.js` implements it —
`showOpenFilePicker` once, the handle persisted in IndexedDB, `getFile()` on every Refresh.
**It does not exist on Chrome for Android or Safari on iOS.** Verified on caniuse before
building: desktop Chrome, Edge and Opera only. So the card is feature-detected with `canLink()`
and simply does not render where the API is missing; the file-input path stays the primary one
and must keep working.

If the one-tap phone flow is wanted, the route is **Web Share Target** — a manifest
`share_target` with `method: POST` and `enctype: multipart/form-data`, received by the service
worker, which means moving vite-plugin-pwa from `generateSW` to `injectManifest` and owning the
SW (precache, navigation fallback, and a fetch handler that stashes the shared file). Then the
flow is Hevy → Share → Baseline. It was scoped and deliberately not done in this pass, because
swapping the service worker on an installed PWA is the one change here that can break his
working install. Do not start it without saying that out loud first.

## Working on it

```bash
cd D:\opengym-hevy
npm install
npm run dev              # http://localhost:5173
npm run build            # -> dist/
```

Push to `main` and GitHub Actions builds and deploys. Nothing manual.

### Test tooling (`tools/`)

No unit-test framework — these are scripts that exercise the real code paths against a generated
Hevy-shaped CSV. Run them after touching matching, fatigue or strength.

```bash
node tools/make-fixture.mjs tools/hevy-fixture.csv   # 8 weeks, 5-day split, 600 sets
node tools/check-matching.mjs                        # exercise-name resolution: expect 61/62
node tools/check-hevy-names.mjs                      # his 7 problem exercises: expect 21/21
node tools/check-pipeline.mjs tools/hevy-fixture.csv # CSV -> state -> fatigue -> ETA
node tools/check-strength.mjs tools/hevy-fixture.csv # e1RM progress; expect 14 of 21 lifts
node tools/find-exercise.mjs "face+pull" "hip+thrust" # search the catalogue when adding aliases
node tools/check-backup.mjs                          # export -> restore round trip
node tools/check-sanity.mjs                          # no name resolves to the wrong body part
```

`check-matching.mjs` reporting anything below 61/62 is a regression. The single expected miss is
`Rowing Machine`, which genuinely has no catalogue equivalent.

`check-sanity.mjs` is the one that must exit 0. It asks a different question from the others:
not *did this resolve* but *did it resolve to something absurd* — a chest machine landing on
legs, a lift landing on a yoga pose. That failure is silent, which is why it gets its own sweep.
It was written after `Butterfly (Pec Deck)` imported as `butterfly yoga pose` and loaded his
adductors. **A wrong match is worse than no match**: an unresolved name shows up in Unidentified
and gets fixed, a wrong one just quietly moves the numbers.

---

## Rules that are load-bearing

**`src/vendor/` is openGym copied verbatim. Never edit it.** Re-vendoring a newer upstream must
stay a straight file copy. Everything project-specific layers on top in `src/lib/`. Two examples
of doing this properly, worth copying if you need a third:

- `match.js` wraps the vendored matcher and is consulted *only after* it fails.
- `vite.config.js` strips unused catalogue fields with a build-time transform rather than editing
  the data file.

**Improvements must repair existing data.** `reresolveCustoms()` runs on every load, so making
the matcher smarter fixes previously-unidentified exercises with no re-import. Keep that
property — he should never be told to re-import to get a fix.

**Never guess muscle attribution.** A Hevy CSV carries no muscle data, and the vendored parser
defaults unmatched exercises to `bp: 'upper legs'` — so an unrecognised shoulder lift would
silently load quads. `neutralize()` in `match.js` strips that guess. Unidentified exercises are
left counting toward *nothing* and listed back to the user. A wrong fatigue reading gets acted
on; a missing one does not.

**Do not invent numbers to fill a gap.** Several deliberate refusals, all of which will look like
missing features to a future reader:

- Delt heads split **volume only**. openGym models and draws one deltoid; splitting fatigue would
  mean inventing a decay curve per head. He reported the missing split in Recovery as a bug —
  reasonably, since Training has one. The fix was to open Shoulders onto the *volume* split with
  a note saying the percentage above covers the whole shoulder, not to fabricate three fatigue
  figures. If this comes back a third time, the answer is still no: `MuscleList`'s `extra` prop
  exists precisely so a group can explain itself without the numbers being faked.
- e1RM stops at 12 reps (openGym's cap). High-rep isolation, bodyweight and timed work therefore
  have no curve — 14 of 21 lifts in the fixture. Correct, not broken.
- Nutrition is **not** wired into recovery scoring, and the Fuel lens does not change that.
  He asked twice: first whether food was affecting the maps (no), then to make the *effect*
  visible, because a chart of intake next to load did not answer "so what does my protein do to
  my shoulders". The answer that survives scrutiny is in `conditionsByGroup()` and
  `consequence()`: attach each muscle group's recent sets to the fed / thin / unlogged state of
  the days those sets were done on, then state the consequence as **how much to trust the
  clock** — under ~1.6 g/kg repair is substrate-limited while the model's 36-hour half-life
  assumes it is not, so "fully ready" becomes the earliest it could be true rather than the day
  it will be. That is a claim about confidence in a number, which the data supports. A scaled
  fatigue percentage is not, and nobody downstream could later tell an invented adjustment from
  a measured one. The banner on the Fatigue lens exists for the same reason: the qualification
  belongs on the screen being qualified, not one lens away.
- Body weight change is coloured **neutral**. Down is a win on a cut and a loss on a bulk, and
  Baseline does not know which. Body fat, waist and lean mass do have a better direction.

---

## Gotchas that cost time

**Service worker caching.** After deploying, the browser serves the old bundle once. Always
verify a deploy server-side, not through the browser:

```bash
U=https://hi7anshu.github.io/baseline/
JS=$(curl -s $U | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "$U$JS" | grep -c "some new string"
```
Tell him to fully close and reopen the app after each deploy.

**Git Bash mangles `VITE_BASE`.** MSYS path conversion turns `/baseline/` into
`C:/Program Files/Git/baseline/`. For a local subpath build use PowerShell:
`$env:VITE_BASE='/baseline/'; npm run build`. CI is unaffected (Linux runner).

**Clear test data after browser testing** — it lands in the same IndexedDB he uses:
```js
const dbs = await indexedDB.databases(); for (const d of dbs) indexedDB.deleteDatabase(d.name);
```

**A `min-height: 0` was the whole "sometimes I can't scroll" bug.** `.body` is a column-flex
child with `overflow-y: auto`; flex children default to `min-height: auto`, so it grew to fit
its content instead of scrolling inside the fixed-height shell, and with `body { overflow:
hidden }` anything below the fold was simply unreachable. It only bit on long screens, which is
why it read as intermittent. If a scroll complaint comes back, check that first, then check
whether a new full-bleed element needs `touch-action: pan-y` (the body map did — a swipe
starting on it did nothing at all).

**Tap-to-delete on a row is a scrolling bug in disguise.** Body history and Fuel day rows used
to delete on a tap anywhere in the row; a scroll that starts on a row fires it. Both now carry
an explicit `×`. Do not reintroduce the pattern.

**Stale data is the failure mode of the CSV workflow.** Fatigue decays with wall-clock time, so
when imports stop, every muscle drifts toward "ready" and the app quietly turns into an argument
for training everything — the most misleading state it can reach, and the one that looks like
good news. `lib/freshness.js` reports the age of the newest workout; past `STALE_DAYS` the
Recovery banner and the Data note both say so. A gap in the data and a week off are
indistinguishable from inside, so neither claims to know which it was.

**Six tabs is the ceiling.** Recovery, Training, Sleep, Body, Fuel, Data. Anything further gets a
lens inside an existing tab, not a seventh icon — the strip is already at the width where labels
start truncating on a small phone.

**Theming is token-only.** `styles.css` defines every surface, ink and ramp as a variable on
`:root`, and `:root[data-theme="light"]` redefines them. A hardcoded hex anywhere else silently
breaks one theme — the palettes are matched on meaning (`--l0` is always "least of it"), not on
hue, because the mid-tone greens and ambers that read as calm on `#0d1117` turn to mush on white.
The vendored `LineChart` reaches for openGym's own names (`--sep-op`, `--yellow`, `--acc`,
`--surface-2`, `--label-2/3`); those are bridged at the bottom of the stylesheet. Two of them
were missing until 2026-09-08, which is why chart gridlines never drew.

**Python heredocs eat backslash escapes.** A `\'` inside a JSX string became a syntax error once.
Prefer the Edit tool for code containing escapes.

---

## Open items

**Untested path** — Hevy API sync. Written, plausible, never run against a real key, and it
cannot be until he has Pro. Treat any change near it as unverified.

**`Rowing Machine`** and anything else the catalogue lacks: resolvable by him in
**Data → Unidentified exercises**, either by pointing at a catalogue exercise or naming muscles
directly. No code change needed.

**Ideas not started**, roughly in value order:
1. **Web Share Target** for the Android import flow — see the section above, including why it was
   held back.
2. **Sleep against training load** — the pairing not yet drawn: late sessions against that night's
   onset. `lib/journal.js`'s `correlate()` takes any two series, so it is a view, not new maths.
2. **`progression.js`** — openGym's next-weight suggestions. Lower value, since he programmes in
   Hevy and would act there, not here.

The consistency heatmap was written here rather than vendored from openGym: theirs marks
attendance, this one shades by working sets, because a four-set session and a fifteen-set one are
not the same day and a grid that says they are flatters a bad month.

Also worth knowing: the Fuel lens's group table reads mostly "unlogged" until intake is logged
on the days he trains. That is correct and deliberate — an unlogged day is never counted as fed —
but it does mean the panel looks thin until the habit sticks.

Done since the first handoff, second pass: the Sessions lens (16-week heatmap, weekly volume
against its own average with the current partial week excluded, and the session log with sets
collapsed — "60 kg × 10 ×3"), the Train today card, linked-file import, and the stale-data
warning.

Done since the first handoff: per-measurement trend charts (all nine metrics, and switching to an
empty one no longer unmounts the card), a nutrition-over-time chart as the Recovery → Fuel lens,
backup restore, and estimated-1RM labelling — the strength list printed `40 kg` for a 30 kg × 10
set, which is Epley working correctly and reading as a weight he had never lifted. Estimates now
carry `≈`, the card says so, and each lift shows its heaviest real set beside the projection.

---

## Context about him

- Trains a 5-day split; **does not log RPE**, which is why Effort auto-hides.
- Wants zero maintenance. Do not propose a VPS, Docker or anything with uptime.
- Direct, outcome-focused. He spots inconsistencies quickly — the shoulders-has-no-dropdown and
  the profile-does-nothing reports were both correct and both real bugs.
- Longer-term memory about him lives in
  `C:\Users\hitan\.claude\projects\H--My-Drive-My-Vault\memory\hevy_fatigue_app.md`.
