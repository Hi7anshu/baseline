// Does re-importing the CSV correct a day that was matched wrongly the first time?
//
// This is the property that matters after any change to matching, and it is not obvious from
// either side on its own: upstream's mergeImport lets an existing day win, so on its own a
// second import of the same export would change nothing, and a fix would never reach training
// already on the device. Data.jsx drops the overlapping dates first, which makes the incoming
// file authoritative. That line is load-bearing and easy to delete by accident, so it is
// reproduced here and checked.
//
//   node tools/check-reimport.mjs tools/hevy-fixture.csv
import { readFileSync } from 'node:fs'
import { parseImport, mergeImport } from '../src/vendor/lib/import-csv.js'
import { remapParsed, reresolveCustoms } from '../src/lib/match.js'
import { EXIDX } from '../src/vendor/lib/exercises.js'

const WRONG = '1494'   // butterfly yoga pose, adductors — what a pec deck used to become
const RIGHT = '0596'   // lever seated fly, chest — what it is

const csv = readFileSync(process.argv[2] || 'tools/hevy-fixture.csv', 'utf8')
const has = (workouts, id) => workouts.filter(w => w.entries.some(e => e.id === id)).length

// State as his device held it: the day is on file, filed under the wrong exercise.
const S = { workouts: [], customEx: [], bodyweight: [], exWeights: {}, unit: 'kg' }
mergeImport(S, remapParsed(parseImport(csv, { unit: 'kg' })))
for (const w of S.workouts) for (const e of w.entries) if (e.id === RIGHT) e.id = WRONG
if (!has(S.workouts, WRONG)) {
  console.log(`This fixture has no ${EXIDX[RIGHT].n} in it — nothing to check.`)
  process.exit(0)
}
console.log(`before: ${has(S.workouts, WRONG)} day(s) filed under ${WRONG} ${EXIDX[WRONG].n} [${EXIDX[WRONG].bp}]`)

// Exactly what the import button does, with the same export handed over a second time.
const next = structuredClone(S)
const parsed = remapParsed(parseImport(csv, { unit: 'kg' }), next.overrides)
const incoming = new Set(parsed.workouts.map(w => w.d))
const before = next.workouts.length
next.workouts = next.workouts.filter(w => !incoming.has(w.d))
const replaced = before - next.workouts.length
mergeImport(next, parsed)
const out = reresolveCustoms(next)

const stale = has(out.workouts, WRONG)
const fixed = has(out.workouts, RIGHT)
console.log(`re-import: ${replaced} day(s) refreshed, ${out.workouts.length} on file`)
console.log(`after : ${stale} day(s) still ${WRONG}, ${fixed} now ${RIGHT} ${EXIDX[RIGHT].n} [${EXIDX[RIGHT].bp}]`)

const ok = stale === 0 && fixed > 0
console.log(ok
  ? '\nPASS — re-importing the export reaches training already on the device.'
  : '\nFAIL — a matching fix no longer reaches old days. Check that Data.jsx still drops '
    + 'overlapping dates before calling mergeImport.')
process.exit(ok ? 0 : 1)
