// End-to-end check of the data path, without a browser: CSV -> state -> fatigue -> ETA.
import { readFileSync } from 'node:fs'
import { parseImport, mergeImport } from '../src/vendor/lib/import-csv.js'
import { fatigueOf, strengthOf } from '../src/vendor/lib/recovery.js'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../src/vendor/lib/muscles.js'
import { effortSummary, hasEffort, displayScale } from '../src/vendor/lib/effort.js'
import { recoveryRows, fmtEta } from '../src/lib/eta.js'
import { remapParsed } from '../src/lib/match.js'
import { normalizeWorkouts } from '../src/lib/hevy.js'
import { registerCustom } from '../src/vendor/lib/exercises.js'

const S = { workouts: [], customEx: [], bodyweight: [], exWeights: {}, unit: 'kg' }

const parsed = remapParsed(parseImport(readFileSync(process.argv[2] || 'hevy-fixture.csv', 'utf8'), { unit: 'kg' }))
if (parsed.error) throw new Error('parse failed: ' + parsed.error)

console.log('== IMPORT ==')
console.log('source        :', parsed.source)
console.log('workouts      :', parsed.workouts.length)
console.log('sets / skipped:', parsed.sets, '/', parsed.skipped)
console.log('warmups       :', parsed.warmups)
console.log('rpe sets      :', parsed.rpeSets)
console.log('matched ex    :', parsed.matched, '| created custom:', parsed.created)
console.log('unmatched     :', parsed.unmatchedNames)

const merged = mergeImport(S, parsed)
console.log('merged        :', merged)

const now = Date.now()
const fatigue = fatigueOf(S.workouts, now, { unit: 'kg' })
const strength = strengthOf(S.workouts, now, { unit: 'kg' })

console.log('\n== FATIGUE (worst first) ==')
for (const r of recoveryRows(fatigue).sort((a, b) => b.value - a.value).slice(0, 10)) {
  console.log(
    (MUSCLE_NAME[r.slug] || r.slug).padEnd(12),
    (Math.round(r.value * 100) + '%').padStart(5),
    r.state.padEnd(11),
    'ready in', fmtEta(r.readyIn),
  )
}

console.log('\n== RETAINED STRENGTH (lowest first) ==')
for (const [slug, v] of Object.entries(strength).sort((a, b) => a[1] - b[1]).slice(0, 6)) {
  console.log((MUSCLE_NAME[slug] || slug).padEnd(12), Math.round(v * 100) + '%')
}

const cutoff = now - 30 * 86400000
const recent = S.workouts.filter(w => (w.start || new Date(w.d).getTime()) > cutoff)
const load = loadOfWorkouts(recent)
const { worked, missed } = rankOf(load)
console.log('\n== VOLUME, 30d ==')
console.log('sessions:', recent.length)
console.log('top     :', worked.slice(0, 6).map(m => `${MUSCLE_NAME[m]} ${Math.round(load[m] * 10) / 10}`).join(', '))
console.log('missed  :', missed.map(m => MUSCLE_NAME[m]).join(', ') || '(none)')

console.log('\n== EFFORT ==')
console.log('hasEffort:', hasEffort(S), '| scale:', displayScale(S))
console.log('90d      :', effortSummary(S, 90))

// The API path shares the normalizer, so verify it against a hand-built workout too.
console.log('\n== API NORMALIZER ==')
const api = normalizeWorkouts([{
  id: 'w1', title: 'Push', start_time: new Date(now - 3600000).toISOString(),
  end_time: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
  exercises: [
    {
      index: 0, title: 'Bench Press (Barbell)', exercise_template_id: 'T1',
      sets: [
        { index: 0, type: 'warmup', weight_kg: 40, reps: 10, rpe: null },
        { index: 1, type: 'normal', weight_kg: 80, reps: 5, rpe: 9 },
      ],
    },
    {
      index: 1, title: 'Wobbly Cable Thing', exercise_template_id: 'T2',
      sets: [{ index: 0, type: 'normal', weight_kg: 20, reps: 12, rpe: 8 }],
    },
  ],
}], new Map([['T2', {
  id: 'T2', title: 'Wobbly Cable Thing', equipment: 'cable',
  primary_muscle_group: 'lower_back', secondary_muscle_groups: ['glutes', 'hamstrings'],
}]]))
console.log('workouts :', api.workouts.length, '| entries:', api.workouts[0].entries.map(e => e.id))
console.log('customEx :', JSON.stringify(api.customEx))
registerCustom(api.customEx)
const apiFatigue = fatigueOf(api.workouts, now, { unit: 'kg' })
console.log('non-zero :', Object.entries(apiFatigue).filter(([, v]) => v > 0.001)
  .map(([k, v]) => `${MUSCLE_NAME[k]} ${Math.round(v * 100)}%`).join(', '))
