// Backup round-trip: export writes a file, restore reads it back, nothing goes missing on the
// way through. The parts that only live on this device — measurements, nutrition, profile — are
// the ones worth checking, because Hevy cannot replace them if a restore drops them.
import { parseBackup, emptyState } from '../src/lib/store.js'

const S = {
  ...emptyState(),
  workouts: [{ id: 'w1', d: '2026-09-01', start: 1, entries: [] }],
  bodyweight: [{ d: '2026-09-01', w: 73.4 }],
  measurements: [{ d: '2026-09-01', weight: 73.4, waist: 82, neck: 38 }],
  nutrition: [{ d: '2026-09-01', kcal: 2200, protein: 150, carbs: 200, fat: 70 }],
  profile: { heightCm: 175, sex: 'male', dob: '1997-05-10', activity: 1.55 },
}

// Same shape exportJSON writes, key redacted exactly as it redacts it.
const file = JSON.stringify({
  exportedAt: new Date().toISOString(),
  app: 'baseline',
  state: S,
  settings: { apiKey: '(redacted)', lastSync: null, syncCursor: null, bodyweightKg: null },
})

const fail = []
const check = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`); if (!cond) fail.push(name) }

const { state, settings, counts } = parseBackup(file, { apiKey: 'device-key', lastSync: null })

check('workouts survive', state.workouts.length === 1)
check('measurements survive', state.measurements.length === 1 && state.measurements[0].waist === 82)
check('nutrition survives', state.nutrition[0].protein === 150)
check('profile survives', state.profile.heightCm === 175)
check('bodyweight survives', state.bodyweight[0].w === 73.4)
check('counts reported', counts.workouts === 1 && counts.nutrition === 1)
check('device key kept over the redacted one', settings.apiKey === 'device-key')
check('shape gaps filled from emptyState', state.unit === 'kg' && !!state.overrides && !!state.exWeights)

const rejects = (label, text) => {
  try { parseBackup(text, {}); check(label, false) }
  catch (e) { check(`${label} — ${e.message}`, true) }
}
rejects('rejects non-JSON', 'not json at all')
rejects('rejects JSON that is not a backup', '{"hello":"world"}')
rejects('rejects another app\'s backup', JSON.stringify({ app: 'strong', state: { workouts: [] } }))

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall good')
process.exit(fail.length ? 1 : 0)
