// Closing the gap between Hevy's exercise names and openGym's catalogue.
//
// openGym's matcher resolves about three quarters of a typical Hevy vocabulary. The rest fall
// back to body-part weights, which is a real loss here: "Bicep Curl (Dumbbell)" landing on
// "upper arms" splits its load evenly across biceps and triceps, so a curl quietly fatigues
// your triceps. Everything below sits *on top of* the vendored matcher and is only consulted
// after it has already failed, so upstream stays authoritative and byte-identical.
import { matchExercise } from '../vendor/lib/import-csv.js'
import { EXIDX } from '../vendor/lib/exercises.js'

// Hevy writes "Movement (Equipment)"; the dataset writes "equipment movement" and prefers the
// anatomical plural. These two facts explain most of the misses on their own.
const PLURALS = [
  [/\bbicep\b/g, 'biceps'], [/\btricep\b/g, 'triceps'],
  [/\bflyes\b/g, 'fly'], [/\bflies\b/g, 'fly'], [/\bcrossovers\b/g, 'crossover'],
]

const tidy = name => {
  let s = String(name || '').toLowerCase().replace(/[-–—]/g, ' ')
  PLURALS.forEach(([re, to]) => { s = s.replace(re, to) })
  return s.replace(/\s+/g, ' ').trim()
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
}

const aliasHit = (base, qualifier) =>
  HEVY_ALIAS[`${base}|${qualifier}`] || HEVY_ALIAS[base] || null

/**
 * Resolve a Hevy exercise title to a catalogue id, or null.
 *
 * Tried in order of confidence: the vendored matcher, then the curated overlay, then two
 * generic rewrites that exploit Hevy's naming convention — drop the equipment qualifier, and
 * move it to the front the way the dataset writes it.
 *
 * @param {string} name Exercise title as Hevy writes it.
 * @returns {string|null} Dataset exercise id, or null when nothing resolves.
 */
export function resolveName(name) {
  const direct = matchExercise(name)
  if (direct) return direct

  const { base, qualifier } = parts(name)

  const alias = aliasHit(base, qualifier)
  if (alias && EXIDX[alias]) return alias

  // "Leg Curl (Machine)" -> "leg curl": reaches upstream's own unqualified alias table.
  if (qualifier) {
    const bare = matchExercise(base)
    if (bare) return bare
  }

  // "Bicep Curl (Dumbbell)" -> "dumbbell biceps curl": the dataset's own word order.
  if (qualifier) {
    const reordered = matchExercise(`${qualifier} ${base}`)
    if (reordered) return reordered
  }

  // Last try: the plural/singular fixes alone, with no restructuring.
  const tidied = tidy(name)
  if (tidied !== String(name || '').toLowerCase()) {
    const fixed = matchExercise(tidied)
    if (fixed) return fixed
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
 * @returns {object} The same shape, with recoverable custom exercises resolved.
 */
export function remapParsed(parsed) {
  if (!parsed || parsed.kind !== 'workouts' || !parsed.customEx?.length) return parsed

  const rewrite = new Map()
  const kept = []
  for (const custom of parsed.customEx) {
    const id = resolveName(custom.n)
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
