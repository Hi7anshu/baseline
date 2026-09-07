# Handoff

Written 2026-09-07. Read this plus `README.md` before changing anything.

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
| Training → Volume (sets/muscle, delt heads) | Done |
| Training → Strength (e1RM per lift, PRs, stalls) | Done |
| Training → Effort (RPE) | Done, hidden unless rated sets exist |
| Body (measurements, body fat, FFMI, trend charts, profile) | Done |
| Fuel (macros, targets, Claude prompt) | Done |
| Data (CSV import, exercise identification, export) | Done |
| Hevy API sync | **Written but never run against a real key** — see below |
| Body-weight import | **Written, never tested on a real Hevy measurements export** |

### The one thing worth doing first

**Find out whether he has Hevy Pro.** He said "not sure", but he successfully exported a workout
CSV, and [Hevy's docs](https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy)
plus several reviews say CSV export is Pro-only. If he *is* on Pro:

- `lib/hevy.js` sync works — automatic, incremental via `/v1/workouts/events`, no manual export.
- `/v1/body_measurements` gives weight and measurements directly.
- The whole "paste a CSV every week" flow becomes unnecessary.

Test is 10 seconds: paste any key into Data → Automatic sync. A 403 means no Pro; a 401 means
the key is wrong. Both are handled with distinct messages.

---

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
```

`check-matching.mjs` reporting anything below 61/62 is a regression. The single expected miss is
`Rowing Machine`, which genuinely has no catalogue equivalent.

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
  mean inventing a decay curve per head.
- e1RM stops at 12 reps (openGym's cap). High-rep isolation, bodyweight and timed work therefore
  have no curve — 14 of 21 lifts in the fixture. Correct, not broken.
- Nutrition is **not** wired into recovery scoring. Intake and volume share a timeline and
  concrete things get flagged; no causal claim is made, because the data cannot support one.
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

**Python heredocs eat backslash escapes.** A `\'` inside a JSX string became a syntax error once.
Prefer the Edit tool for code containing escapes.

---

## Open items

**Untested paths** — both are written and plausible but have never seen real data:
- Hevy API sync (needs a Pro key).
- Body-weight import. `parseBodyweight` handles Apple Health XML and generic date+weight CSV;
  the exact shape of a Hevy *measurements* export is unknown. Get a real file before trusting it.

**`Rowing Machine`** and anything else the catalogue lacks: resolvable by him in
**Data → Unidentified exercises**, either by pointing at a catalogue exercise or naming muscles
directly. No code change needed.

**Ideas not started**, roughly in value order:
1. **Consistency heatmap** — `Heatmap.jsx` and `streakWeeks()` exist in openGym, not yet vendored.
   Cheap, and "did I actually turn up" pairs naturally with the rest.
2. **Nutrition trend chart** — Fuel currently shows day rows and averages; `LineChart` is already
   vendored, so calories/protein over time is a small addition.
3. **Per-measurement charts** — Body charts weight, body fat and waist. Arm, thigh, chest etc. are
   logged but not plotted.
4. **`progression.js`** — openGym's next-weight suggestions. Lower value, since he programmes in
   Hevy and would act there, not here.

---

## Context about him

- Trains a 5-day split; **does not log RPE**, which is why Effort auto-hides.
- Wants zero maintenance. Do not propose a VPS, Docker or anything with uptime.
- Direct, outcome-focused. He spots inconsistencies quickly — the shoulders-has-no-dropdown and
  the profile-does-nothing reports were both correct and both real bugs.
- Longer-term memory about him lives in
  `C:\Users\hitan\.claude\projects\H--My-Drive-My-Vault\memory\hevy_fatigue_app.md`.
