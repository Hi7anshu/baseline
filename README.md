# Baseline

**Live: https://hi7anshu.github.io/baseline/**

Recovery, body composition and nutrition for a [Hevy](https://hevy.com) training log, as an
installable iPhone web app.

Hevy tells you how many sets a muscle got. Baseline tells you which muscles are still cooked,
when they clear, which are quietly detraining, what your composition is doing, and whether you
are eating enough to support any of it — using
[openGym](https://github.com/DuarteSantos8/openGym)'s recovery model over Hevy's data.

It **only reads** Hevy. Keep logging there exactly as you do now.

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
| **Hevy's servers** | Source of truth for training. Your account, your history, their backups. |
| **Your phone** | An IndexedDB cache, plus measurements and nutrition, which live only here. |
| **Anywhere else** | Nothing. The host serves files and sees no data. |

Training can always be rebuilt from Hevy. Measurements and nutrition are logged here and exist
nowhere else, so use **Export backup** on the Data tab if they matter to you.

---

## The five tabs

**Recovery** — one body map, two lenses. *Fatigue* is what is too fresh to train; *Retention* is
what has gone stale from not being trained. They are opposite instructions, so they share a
screen. Green is good on both.

**Training** — *Volume* (effective sets per muscle, on a neutral blue scale because volume has
no good or bad end; shoulders breaks down into front / side / rear delts), *Strength* (estimated
1RM per lift over time, with PRs and stalls), and *Effort* (RPE spread and weekly trend), which
appears only once rated sets exist since Hevy has RPE off by default.

**Body** — weight, neck, waist, hips, chest, arm, thigh, calf. Derives waist-to-height, body
fat, lean mass, BMI and FFMI, and charts each over time. Profile lists what it unlocks and what
is still missing. Exists because Hevy gates everything past weight and waist behind Pro.

**Fuel** — daily calories and macros, with the entry form always open. A copyable prompt makes
Claude reply in exactly the format the paste box reads. Calorie and macro targets are computed
from your profile.

**Data** — import, sync, export, and identifying exercises the catalogue does not know.

---

## Getting your training in

**CSV (any Hevy account).** In Hevy: Settings → Export & Import Data → Export Workout Data.
Save the file, open the **Data** tab, pick it. Hevy exports your whole history every time, so a
re-import refreshes every day it covers — editing a past session in Hevy and re-exporting
corrects it here, rather than leaving the first version frozen.

**API sync (needs Hevy Pro).** Get a key at `hevy.com/settings?developer` and paste it into the
Data tab. The first sync pulls everything; later syncs ask `/v1/workouts/events` for only what
changed, so an edited or deleted workout corrects itself. The key is stored on your device and
is sent to nobody but Hevy.

**Body weight** has its own import — a Hevy measurements export, an Apple Health export, or any
CSV with a date and a weight column.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## Deploying

Pushing to `main` builds and publishes to GitHub Pages automatically
(`.github/workflows/deploy.yml`). Nothing to run by hand.

`VITE_BASE` tells the build its subpath — the workflow sets it to `/<repo>/`, which is where a
GitHub Pages project site is served from. It defaults to `/`, so a root-domain host or a custom
domain needs no change beyond pointing DNS and clearing the variable.

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
    match.js       exercise-name overlay and manual assignment
    eta.js         recovery-time arithmetic
    groups.js      18 muscles -> 6 groups, with per-view roll-up
    delts.js       front/side/rear split, inferred from exercise names
    strength.js    e1RM progress per lift, PRs, movers and stalls
    body.js        waist-to-height, Navy body fat, lean mass, FFMI
    nutrition.js   macro parsing, TDEE estimate, weekly summaries
    store.js       IndexedDB persistence
  components/
    MuscleList.jsx grouped, expandable muscle list
  views/           Recovery, Training, Strength, Body, Fuel, Data, Unidentified
```

`src/vendor/` is an unmodified copy of openGym's pure logic, so re-vendoring a newer upstream is
a straight file copy. Everything project-specific sits outside it and layers on top:

- **`match.js`** — openGym's matcher resolves ~76% of a typical Hevy vocabulary; the rest fall
  back to body-part weights, which is actively wrong (a "Bicep Curl (Dumbbell)" filed under
  "upper arms" fatigues your triceps). The overlay runs only after upstream has failed, and
  fixes the *classes* of disagreement between the two catalogues rather than naming exercises:
  unilateral wording (Hevy "single arm" vs dataset "one arm"), inconsistent bicep/triceps
  plurals, equipment placed inline or in parentheses, and grip/stance qualifiers the dataset
  has no variant for. A 62-name sample goes from 47/62 to 61/62.
- **Exercises the catalogue does not contain at all** are the permanent gap — openGym's list is
  fixed and Hevy keeps adding movements. The **Unidentified exercises** panel lets you point one
  at a catalogue exercise or name its muscles directly. The decision is remembered by name,
  applied to every future import, and **back-applied to history already on file**. Improving the
  matcher also re-runs on load, so previously unidentified exercises resolve themselves with no
  re-import.
- Until identified, such an exercise is left **unattributed rather than guessed**, and listed
  back to you. A wrong fatigue reading gets acted on; a missing one does not.
- **Build-time catalogue trim** (`vite.config.js`) drops the exercise instructions and media
  filenames nothing renders, cutting the bundle by roughly 60% without touching the vendored
  source.

## What the numbers mean

- **Fatigue** — intensity-weighted volume per muscle, decaying on a 36-hour half-life, scored
  against your own recent sessions. Bands: ready < 25%, recovering ≤ 50%, fatigued above. A
  group shows its *most* fatigued muscle, because that is what limits the session.
- **Ready in** — solved from the decay curve, not estimated: the time for accumulated stimulus
  to fall to the ready threshold.
- **Retained strength** — full for 14 days after a work set, then a 28-day half-life to a 50%
  floor. A group shows its weakest muscle *that you actually train*; muscles sitting on the
  floor because they were never worked directly would otherwise pin every group at 50% forever.
- **Effort** — aggregated in RIR internally and converted for display, so a history mixing RPE
  and RIR still draws one series. Averages are hidden below 5 rated sets.
- **Estimated 1RM** — Epley, from the best working set of each session, and **only up to 12
  reps**. Above that the formulas disagree by double digits and the number stops describing
  maximal strength, so openGym refuses to produce one — which means high-rep isolation work,
  bodyweight sets and timed holds have no curve here at all. That absence is correct, not a gap.
  The set behind each estimate is shown, because 142 kg off 100×10 is a weaker claim than the
  same number off a heavy triple.
- **Waist-to-height** — needs no equation and no assumptions. Under 0.5 is the usual guideline.
  This is the body number to trust.
- **Body fat** — US Navy circumference method. Roughly ±3–4 points on the absolute value but
  reliable on direction, so read the trend, not the digit. Lean mass and FFMI are derived from
  it and inherit that error; all three are marked ≈.
- **Estimated burn** — Mifflin-St Jeor scaled by a self-reported activity level. A reference
  line for a week of intake, not a target. Protein is given as a range because the evidence is a
  range; fat as a floor; carbs as whatever the other two leave.
- **Delt heads** — openGym models and draws a single deltoid, so front/side/rear cannot be
  separated on the map or in fatigue without inventing a decay curve per head. Volume *can* be
  split, because the exercise name says which head it is, so the breakdown is offered there only
  and labelled as inferred. Movements whose head cannot be read are spread evenly across the
  three and reported as a percentage.
- **Body weight change is shown neutrally.** Down is a win on a cut and a loss on a bulk, and
  Baseline does not know which you are doing. Body fat, waist and lean mass do have an
  unambiguous better direction and are coloured accordingly.

Nutrition and training are shown on one timeline, and concrete things are flagged — protein
against body weight, intake against estimated burn. Baseline does **not** compute a recovery
score from food. That data cannot support it, and a confident invented number would be worse
than none.

## Licence and attribution

`src/vendor/` is from [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos,
**AGPL-3.0** — so this project is AGPL-3.0 too (see `LICENSE`). Body geometry is from MuscleMap
by Melih Colpan (MIT); see `NOTICE-opengym.md`.

Not affiliated with Hevy or openGym.
