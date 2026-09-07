// How well does openGym's matcher cope with Hevy's naming, and what does the catalogue
// actually call the misses? Drives the overlay table rather than guessing at it.
import { matchExercise } from '../src/vendor/lib/import-csv.js'
import { resolveName } from '../src/lib/match.js'
import { EXDB, EXIDX } from '../src/vendor/lib/exercises.js'

const NAMES = [
  'Bench Press (Barbell)', 'Bench Press (Dumbbell)', 'Incline Bench Press (Barbell)',
  'Incline Bench Press (Dumbbell)', 'Chest Press (Machine)', 'Chest Fly (Dumbbell)',
  'Cable Fly Crossovers', 'Push Up', 'Squat (Barbell)', 'Front Squat (Barbell)',
  'Hack Squat (Machine)', 'Leg Press (Machine)', 'Leg Extension (Machine)',
  'Leg Curl (Machine)', 'Seated Leg Curl (Machine)', 'Lying Leg Curl (Machine)',
  'Romanian Deadlift (Barbell)', 'Deadlift (Barbell)', 'Sumo Deadlift (Barbell)',
  'Hip Thrust (Barbell)', 'Calf Press (Machine)', 'Standing Calf Raise (Machine)',
  'Seated Calf Raise (Machine)', 'Lat Pulldown (Cable)', 'Pull Up', 'Chin Up',
  'Bent Over Row (Barbell)', 'Bent Over Row (Dumbbell)', 'Seated Row (Cable)',
  'Seated Cable Row - Bar Grip', 'Face Pull (Cable)', 'Shrug (Barbell)',
  'Shrug (Dumbbell)', 'Overhead Press (Barbell)', 'Shoulder Press (Dumbbell)',
  'Shoulder Press (Machine)', 'Lateral Raise (Dumbbell)', 'Lateral Raise (Cable)',
  'Rear Delt Reverse Fly (Dumbbell)', 'Front Raise (Dumbbell)', 'Upright Row (Barbell)',
  'Bicep Curl (Dumbbell)', 'Bicep Curl (Barbell)', 'Bicep Curl (Cable)',
  'Hammer Curl (Dumbbell)', 'Preacher Curl (Barbell)', 'Concentration Curl (Dumbbell)',
  'Triceps Pushdown (Cable)', 'Triceps Extension (Dumbbell)', 'Skullcrusher (Barbell)',
  'Triceps Dip', 'Overhead Triceps Extension (Cable)', 'Wrist Curl (Dumbbell)',
  'Plank', 'Hanging Leg Raise', 'Crunch (Machine)', 'Russian Twist', 'Cable Crunch',
  'Treadmill', 'Cycling', 'Rowing Machine', 'Stair Machine',
]

let ok = 0
const misses = []
for (const n of NAMES) {
  const id = resolveName(n)
  if (id) { ok++; continue }
  misses.push(n)
}
console.log(`matched ${ok}/${NAMES.length}\n`)
console.log('MISSES:')
for (const n of misses) console.log('  ' + n)

// For each miss, show what the catalogue plausibly calls it, so the overlay maps to real ids.
console.log('\nCANDIDATES IN CATALOGUE:')
const core = n => n.replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/gi, ' ').trim().toLowerCase()
for (const n of misses) {
  const words = core(n).split(/\s+/).filter(w => w.length > 2)
  const hits = EXDB
    .filter(e => words.every(w => e.n.includes(w.replace(/s$/, ''))))
    .slice(0, 6)
    .map(e => `${e.id}:${e.n}`)
  console.log(`  ${n}\n      ${hits.join('\n      ') || '(nothing)'}`)
}
