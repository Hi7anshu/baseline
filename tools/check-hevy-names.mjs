import { resolveName } from '../src/lib/match.js'
import { EXIDX } from '../src/vendor/lib/exercises.js'
import { musclesOf, MUSCLE_NAME } from '../src/vendor/lib/muscles.js'

// His seven, in several plausible spellings — the exact Hevy strings are unknown, so the fix
// has to survive the variation rather than match one transcription.
const CASES = [
  ['ab wheel', ['Ab Wheel', 'Ab Wheel Rollout', 'Ab Roller']],
  ['chest-supported T-bar row', ['Chest Supported T-Bar Row', 'T Bar Row', 'T-Bar Row (Machine)']],
  ['isolated chest press machine', ['Iso-Lateral Chest Press (Machine)', 'Isolated Chest Press Machine', 'Chest Press (Machine)']],
  ['seated incline curls', ['Seated Incline Curl (Dumbbell)', 'Seated Incline Curls', 'Incline Curl (Dumbbell)']],
  ['dumbbell single-arm lateral raise', ['Single Arm Lateral Raise (Dumbbell)', 'Dumbbell Single-Arm Lateral Raises', 'Lateral Raise Single Arm (Dumbbell)']],
  ['cable single-arm tricep pushdown', ['Single Arm Tricep Pushdown (Cable)', 'Cable Single-Arm Tricep Pushdown', 'Triceps Pushdown Single Arm (Cable)']],
  ['cable single-leg extension', ['Single Leg Extension (Cable)', 'Cable Single-Leg Extensions', 'Leg Extension Single Leg (Machine)']],
]

let hit = 0, total = 0
for (const [label, variants] of CASES) {
  console.log(`\n${label}`)
  for (const v of variants) {
    total++
    const id = resolveName(v)
    if (!id) { console.log(`   MISS  "${v}"`); continue }
    hit++
    const ex = EXIDX[id]
    const m = Object.entries(musclesOf(ex)).sort((a, b) => b[1] - a[1])
      .map(([s, w]) => `${MUSCLE_NAME[s]} ${w}`).join(', ')
    console.log(`   ok    "${v}"\n           -> ${id} ${ex.n}\n           -> ${m}`)
  }
}
console.log(`\n${hit}/${total} spellings resolved`)
