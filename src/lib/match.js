// Closing the gap between Hevy's exercise names and openGym's catalogue.
//
// openGym's matcher resolves about three quarters of a typical Hevy vocabulary. The rest fall
// back to body-part weights, which is a real loss here: "Bicep Curl (Dumbbell)" landing on
// "upper arms" splits its load evenly across biceps and triceps, so a curl quietly fatigues
// your triceps. Everything below sits *on top of* the vendored matcher and is only consulted
// after it has already failed, so upstream stays authoritative and byte-identical.
import { matchExercise } from '../vendor/lib/import-csv.js'
import { EXIDX, EXDB } from '../vendor/lib/exercises.js'

// Hevy writes "Movement (Equipment)"; the dataset writes "equipment movement" and prefers the
// anatomical plural. These two facts explain most of the misses on their own.
//
// The rest are vocabulary disagreements between the two catalogues. Fixing them here rather
// than naming individual exercises is what makes the fix hold: "single arm" -> "one arm"
// resolves every single-arm variant Hevy has, including ones added after this was written.
// The dataset is not self-consistent about biceps/triceps — "dumbbell biceps curl" but "cable
// one arm tricep pushdown" — so neither spelling can be forced. Both are generated and tried.
const ARM_PLURALS = [[/\bbicep\b/g, 'biceps'], [/\btricep\b/g, 'triceps']]

const SYNONYMS = [
  [/\bflyes\b/g, 'fly'], [/\bflies\b/g, 'fly'], [/\bcrossovers\b/g, 'crossover'],

  // Unilateral work: Hevy says "single arm", the dataset says "one arm".
  [/\bsingle arm\b/g, 'one arm'], [/\b1 arm\b/g, 'one arm'], [/\bunilateral\b/g, 'one arm'],
  [/\bsingle leg\b/g, 'one leg'], [/\b1 leg\b/g, 'one leg'],

  // The dataset consistently misspells the ab-wheel movement as "rollerout".
  [/\brollout\b/g, 'rollerout'], [/\broll out\b/g, 'rollerout'],
  [/\bab wheel\b/g, 'wheel rollerout'],

  // Hammer Strength plate machines; Hevy labels these "Iso-Lateral".
  [/\biso lateral\b/g, ''], [/\bisolateral\b/g, ''], [/\bisolated\b/g, ''],
]

// Words that say nothing about which exercise this is, or describe a variant the dataset simply
// does not carry. A one-arm lateral raise trains the same muscles as a two-arm one, so dropping
// "one arm" to reach an entry that exists loses nothing that matters to a fatigue model.
const NOISE = [
  'chest supported', 'bar grip', 'wide grip', 'close grip', 'neutral grip', 'reverse grip',
  'one', 'single', 'seated', 'standing', 'bodyweight', 'weighted',
  'assisted', 'alternating', 'alternate',
]

// Equipment the dataset names as the first word of an entry. Hevy sometimes puts it in
// parentheses and sometimes inline, so it has to be recognised in either position.
const EQUIPMENT_WORDS = [
  'barbell', 'dumbbell', 'cable', 'machine', 'lever', 'kettlebell', 'band',
  'resistance band', 'smith', 'sled', 'bodyweight',
]

const squash = s => s.replace(/\s+/g, ' ').trim()

const tidy = (name, pluraliseArms = true) => {
  let s = String(name || '').toLowerCase().replace(/[-–—_/]/g, ' ')
  SYNONYMS.forEach(([re, to]) => { s = s.replace(re, to) })
  if (pluraliseArms) ARM_PLURALS.forEach(([re, to]) => { s = s.replace(re, to) })
  return squash(s)
}

// Drop the qualifiers above. Tried only after faithful forms have failed: removing words makes
// a wrong unique match more likely, not less.
const loosen = s => squash(NOISE.reduce((out, w) => out.replace(new RegExp(`\\b${w}\\b`, 'g'), ''), s))

// Pull an inline equipment word out to the front, the way the dataset writes it:
// "cable one arm triceps pushdown" is already in that shape, "lateral raise cable" is not.
function hoistEquipment(s) {
  for (const eq of EQUIPMENT_WORDS) {
    const re = new RegExp(`\\b${eq}\\b`)
    if (!re.test(s)) continue
    const rest = squash(s.replace(re, ''))
    if (rest) return { eq, rest }
  }
  return null
}

/**
 * Every spelling worth trying for one exercise name, strict forms before loose ones.
 *
 * Generating candidates and testing each beats a hand-written cascade here because the two
 * catalogues disagree along several independent axes at once — plural, word order, equipment
 * placement, unilateral qualifiers — and a name can be wrong on all of them simultaneously.
 */
function candidates(name) {
  const strict = []
  const loose = []

  for (const form of [String(name || '').toLowerCase().trim(), tidy(name), tidy(name, false)]) {
    if (!form) continue
    const { base, qualifier } = parts(form)
    strict.push(form, base)
    if (qualifier) strict.push(`${qualifier} ${base}`)

    const bare = loosen(base)
    if (bare && bare !== base) {
      loose.push(bare)
      if (qualifier) loose.push(`${qualifier} ${bare}`)
    }

    for (const source of [base, bare]) {
      const split = source && hoistEquipment(source)
      if (!split) continue
      loose.push(`${split.eq} ${split.rest}`, split.rest)
    }
  }

  return [...new Set([...strict, ...loose].map(squash).filter(Boolean))]
}

// Movement and qualifier, split on Hevy's parenthetical: "Bicep Curl (Dumbbell)".
function parts(name) {
  const s = tidy(name)
  const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  return m ? { base: m[1].trim(), qualifier: m[2].trim() } : { base: s, qualifier: '' }
}

/**
 * Names openGym's matcher cannot reach, mapped by hand to the dataset entry they mean.
 *
 * Every id here was checked against the catalogue rather than guessed. Where the dataset has no
 * true equivalent the nearest movement pattern is used and noted; where it has nothing close at
 * all (a rowing erg, for instance) the name is deliberately absent, so it stays visibly
 * unmatched instead of being filed under the wrong muscles.
 */
const HEVY_ALIAS = {
  // The dataset spells these "biceps"; the bare alias table upstream is keyed without a qualifier.
  'bicep curl|dumbbell': '0294',        // dumbbell biceps curl
  'bicep curl|barbell': '0031',         // barbell curl
  'bicep curl|cable': '0868',           // cable curl
  'bicep curl|machine': '0868',
  'biceps curl|dumbbell': '0294',
  'biceps curl|barbell': '0031',
  'biceps curl|cable': '0868',

  'triceps extension|dumbbell': '2188', // dumbbell seated triceps extension
  'triceps extension|cable': '0241',    // triceps pushdown
  'triceps extension|barbell': '0061',  // barbell lying triceps extension
  'overhead triceps extension|cable': '0241',
  'overhead triceps extension|dumbbell': '2188',

  'chest fly|dumbbell': '0308',         // dumbbell fly
  'chest fly|cable': '1269',            // cable crossover
  'chest fly|machine': '0602',          // nearest seated lever fly
  'cable fly crossover': '1269',
  'cable fly': '1269',

  'hack squat|machine': '0743',         // sled hack squat
  'hack squat|barbell': '0046',

  'leg curl|machine': '0586',           // lever lying leg curl
  'seated leg curl|machine': '0599',
  'lying leg curl|machine': '0586',

  // No barbell hip thrust in the catalogue; the glute bridge is the same hinge and target.
  'hip thrust|barbell': '1409',
  'hip thrust|machine': '1409',
  'glute bridge|barbell': '1409',

  'seated cable row bar grip': '0861',  // cable seated row
  'seated cable row': '0861',
  'seated row|cable': '0861',

  // No "face pull" entry; the cable rear delt row is the same movement and target.
  'face pull|cable': '0203',
  'face pull': '0203',

  'rear delt reverse fly|dumbbell': '0383',
  'rear delt reverse fly|machine': '0602',
  'rear delt fly|dumbbell': '0383',
  'reverse fly|dumbbell': '0383',
  'reverse fly|machine': '0602',

  'cable crunch': '0175',               // cable kneeling crunch
  'crunch|cable': '0175',

  'stair machine': '2311',              // walking on stepmill
  'stairmaster': '2311',

  // Named backstops for movements the generic rules above should already reach. They cost
  // nothing and mean a change to those rules cannot silently regress these.
  'ab wheel': '0857',                   // wheel rollerout
  'ab roller': '0857',
  'ab wheel rollerout': '0857',
  'wheel rollerout': '0857',
  't bar row': '0606',                  // lever t bar row
  't bar row|barbell': '0606',
  't bar row|machine': '0606',
  'chest press|machine': '0577',        // lever chest press
  'incline chest press|machine': '1299',
  'decline chest press|machine': '1300',
  'seated incline curl|dumbbell': '0318',
  'incline curl|dumbbell': '0318',
  'one arm lateral raise|dumbbell': '0355',
  'one arm lateral raise|cable': '0192',
  'one arm triceps pushdown|cable': '1723',
  'one arm tricep pushdown|cable': '1723',
  'leg extension|cable': '0585',        // no cable variant exists; same movement and target
  'one leg extension|cable': '0585',
  'one leg extension|machine': '0585',
}

const aliasHit = (base, qualifier) =>
  HEVY_ALIAS[`${base}|${qualifier}`] || HEVY_ALIAS[base] || null

/** Key an exercise name is remembered under, so "Ab Wheel" and "ab  wheel" are one entry. */
export const overrideKey = name => tidy(name)

/**
 * Resolve a Hevy exercise title to a catalogue id, or null.
 *
 * Tried strictly in order of confidence, stopping at the first hit:
 *   1. an override you set by hand — always wins, nothing second-guesses it
 *   2. the vendored matcher on the name as written
 *   3. the same matcher after vocabulary fixes ("single arm" -> "one arm")
 *   4. the curated overlay table
 *   5. Hevy's "Movement (Equipment)" convention, unpicked two ways
 *   6. the same again with noise words dropped — the loosest pass, tried last
 *
 * @param {string} name Exercise title as Hevy writes it.
 * @param {Record<string, string>} [overrides] Your own name -> exercise id decisions.
 * @returns {string|null} Dataset exercise id, or null when nothing resolves.
 */
export function resolveName(name, overrides) {
  const chosen = overrides?.[overrideKey(name)]
  if (chosen?.ex && EXIDX[chosen.ex]) return chosen.ex
  if (chosen?.muscles?.length) return null   // handled as a muscle assignment, not a catalogue id

  // The name exactly as written, first and on its own — upstream's matcher is the authority
  // and must never be second-guessed by a rewrite that happens to also match.
  const direct = matchExercise(name)
  if (direct) return direct

  const { qualifier } = parts(name)

  for (const candidate of candidates(name)) {
    const alias = aliasHit(candidate, qualifier) || aliasHit(candidate, '')
    if (alias && EXIDX[alias]) return alias
    const hit = matchExercise(candidate)
    if (hit) return hit
  }

  return null
}

/**
 * Re-resolve the custom exercises a CSV import invented, using the overlay.
 *
 * `parseWorkoutCSV` calls the vendored matcher directly, so the overlay cannot be injected into
 * it without editing upstream. Correcting the result afterwards gets the same outcome and keeps
 * `src/vendor/` a clean copy: any created exercise the overlay can place is rewritten to the
 * real catalogue id, and entries that collide as a result are folded together.
 *
 * @param {object} parsed Result of parseImport for a workout file; returned unchanged for others.
 * @param {Record<string, object>} [overrides] Your own name -> identification decisions.
 * @returns {object} The same shape, with recoverable custom exercises resolved.
 */
export function remapParsed(parsed, overrides) {
  if (!parsed || parsed.kind !== 'workouts' || !parsed.customEx?.length) return parsed

  const rewrite = new Map()
  const kept = []
  for (const custom of parsed.customEx) {
    const id = resolveName(custom.n, overrides)
    if (id && EXIDX[id]) rewrite.set(custom.id, id)
    else kept.push(neutralize(custom, parsed.source))
  }
  if (!rewrite.size) return { ...parsed, customEx: kept }

  const workouts = parsed.workouts.map(w => {
    const merged = []
    for (const entry of w.entries) {
      const id = rewrite.get(entry.id) || entry.id
      const existing = merged.find(e => e.id === id)
      if (existing) existing.sets.push(...entry.sets)
      else merged.push({ ...entry, id })
    }
    for (const e of merged) {
      const top = Math.max(0, ...e.sets.filter(s => s.phase !== 'warmup').map(s => s.w || 0))
      e.topW = top || null
    }
    return { ...w, entries: merged }
  })

  // The parser records unmatched names as written but lowercases them on the exercise it
  // invents, so these two lists only line up case-insensitively.
  const rescued = new Set([...rewrite.keys()]
    .map(id => parsed.customEx.find(c => c.id === id)?.n?.toLowerCase())
    .filter(Boolean))

  return {
    ...parsed,
    workouts,
    customEx: kept,
    created: kept.length,
    matched: parsed.matched + rewrite.size,
    unmatchedNames: (parsed.unmatchedNames || []).filter(n => !rescued.has(String(n).toLowerCase())),
    rescued: [...rescued],
  }
}

/**
 * Strip the parser's body-part guess from an exercise it could not place.
 *
 * With no category column — and a Hevy export has none — `parseWorkoutCSV` falls back to
 * "upper legs" for anything it cannot match. An unrecognised shoulder movement would then load
 * quads, hamstrings and glutes, which is worse than not counting it: a silently wrong fatigue
 * reading is acted on, a visibly missing one is not. These names are listed back to the user
 * after every import, so nothing disappears quietly.
 */
function neutralize(custom, source) {
  if (source !== 'Hevy' || custom.bp !== 'upper legs') return custom
  return { ...custom, bp: '', unplaced: true }
}

/* ------------------------------------------------------- retroactive repair -- */

// A muscle you name yourself is the primary; anything after it is a supporting muscle, using
// the same 0.4 weighting the catalogue applies to its own secondaries.
const SECONDARY_WEIGHT = 0.4

const weightsFor = muscles => Object.fromEntries(
  muscles.map((slug, i) => [slug, i === 0 ? 1 : SECONDARY_WEIGHT]),
)

/**
 * Re-run identification over already-imported history.
 *
 * Two things make this necessary rather than merely convenient. Assigning an exercise by hand
 * has to fix the training already on file, not just the next import — nobody wants to re-import
 * to see a correction. And when the matcher itself improves, everything previously filed as
 * unidentified should quietly resolve on next load, with no action at all.
 *
 * Safe to run on every load: with nothing to change it returns the identical object, so React
 * sees no new reference and nothing recomputes.
 *
 * @param {object} S Application state.
 * @returns {object} The same state, or a repaired copy.
 */
export function reresolveCustoms(S) {
  const customs = S?.customEx || []
  if (!customs.length) return S

  const overrides = S.overrides || {}
  const rewrite = new Map()
  const kept = []
  let changed = false

  for (const custom of customs) {
    const id = resolveName(custom.n, overrides)
    if (id && EXIDX[id]) {
      rewrite.set(custom.id, id)
      changed = true
      continue
    }
    // No catalogue entry, but muscles may have been assigned by hand. musclesOf reads
    // `muscleWeights` ahead of everything else, so this overrides the body-part fallback.
    const chosen = overrides[overrideKey(custom.n)]
    if (chosen?.muscles?.length) {
      const weights = weightsFor(chosen.muscles)
      if (JSON.stringify(custom.muscleWeights || null) !== JSON.stringify(weights)) {
        kept.push({ ...custom, muscleWeights: weights, unplaced: false })
        changed = true
        continue
      }
    } else if (custom.muscleWeights) {
      kept.push({ ...custom, muscleWeights: undefined, unplaced: true })
      changed = true
      continue
    }
    kept.push(custom)
  }

  if (!changed) return S

  const workouts = rewrite.size
    ? S.workouts.map(w => {
      const merged = []
      for (const entry of w.entries || []) {
        const id = rewrite.get(entry.id) || entry.id
        const existing = merged.find(e => e.id === id)
        if (existing) existing.sets.push(...entry.sets)
        else merged.push({ ...entry, id })
      }
      for (const e of merged) {
        const top = Math.max(0, ...e.sets.filter(s => s.phase !== 'warmup').map(s => s.w || 0))
        e.topW = top || null
      }
      return { ...w, entries: merged }
    })
    : S.workouts

  return { ...S, workouts, customEx: kept }
}

/** Catalogue search for the assignment picker: all query words must appear in the name. */
export function searchCatalogue(query, limit = 12) {
  const words = tidy(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const out = []
  for (const ex of EXDB) {
    if (words.every(w => ex.n.includes(w))) {
      out.push(ex)
      if (out.length >= limit) break
    }
  }
  return out
}
