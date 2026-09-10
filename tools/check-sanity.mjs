// Does any Hevy name resolve to something anatomically absurd?
//
// Written after "Butterfly (Pec Deck)" imported as "butterfly yoga pose" and loaded his
// adductors — a chest machine filed under legs. The failure was silent: nothing errored, the
// numbers just went to the wrong muscles. So this sweeps the vocabulary rather than one name,
// and fails loudly on anything that smells the same way.
//
//   node tools/check-sanity.mjs
import { resolveName } from '../src/lib/match.js'
import { EXIDX } from '../src/vendor/lib/exercises.js'

// The region a name announces in its own words, and what the catalogue is then allowed to say.
// First rule that matches wins, so the order matters: "leg curl" is a leg, not an arm, and
// "chest supported" describes a bench, not the target. Only the unambiguous ones — this is a
// tripwire, not a second matcher.
const CLAIMS = [
  [/\b(bench|chest|pec|butterfly|push up|dip)\b/, ['chest', 'upper arms', 'shoulders']],
  [/\b(squat|leg press|lunge|leg extension|leg curl|hip thrust|deadlift|glute)\b/, ['upper legs', 'back', 'lower legs']],
  [/\b(calf|calves)\b/, ['lower legs']],
  [/\b(curl|tricep|triceps|pushdown|skullcrusher|dip)\b/, ['upper arms', 'lower arms', 'chest', 'back']],
  [/\b(lateral raise|front raise|shoulder press|overhead press|delt|shrug|upright row)\b/, ['shoulders', 'upper arms', 'back', 'neck']],
  [/\b(pulldown|pull up|chin up|row|lat)\b/, ['back', 'upper arms', 'shoulders']],
  [/\b(crunch|plank|sit up|ab |abs|oblique|rollout|russian twist|leg raise)\b/, ['waist', 'upper legs', 'chest']],
]

// The catalogue carries stretches, yoga poses and mobility drills next to the lifts. A logged
// set never means one of those unless the name says so.
const PASSIVE = /\b(yoga|pose|stretch|stretches|mobility)\b/

const NAMES = [
  'Bench Press (Barbell)', 'Bench Press (Dumbbell)', 'Incline Bench Press (Barbell)',
  'Incline Bench Press (Dumbbell)', 'Decline Bench Press (Barbell)', 'Chest Press (Machine)',
  'Iso-Lateral Chest Press (Machine)', 'Chest Fly (Dumbbell)', 'Chest Fly (Machine)',
  'Butterfly (Pec Deck)', 'Pec Deck (Machine)', 'Butterfly', 'Cable Fly Crossovers',
  'Push Up', 'Chest Dip', 'Triceps Dip',
  'Squat (Barbell)', 'Front Squat (Barbell)', 'Goblet Squat (Dumbbell)',
  'Hack Squat (Machine)', 'Leg Press (Machine)', 'Leg Extension (Machine)',
  'Leg Curl (Machine)', 'Seated Leg Curl (Machine)', 'Lying Leg Curl (Machine)',
  'Romanian Deadlift (Barbell)', 'Deadlift (Barbell)', 'Sumo Deadlift (Barbell)',
  'Hip Thrust (Barbell)', 'Bulgarian Split Squat (Dumbbell)', 'Lunge (Dumbbell)',
  'Calf Press (Machine)', 'Standing Calf Raise (Machine)', 'Seated Calf Raise (Machine)',
  'Lat Pulldown (Cable)', 'Pull Up', 'Chin Up', 'Bent Over Row (Barbell)',
  'Bent Over Row (Dumbbell)', 'Seated Row (Cable)', 'Seated Cable Row - Bar Grip',
  'Chest Supported T-Bar Row', 'T Bar Row', 'Face Pull (Cable)', 'Shrug (Barbell)',
  'Shrug (Dumbbell)', 'Straight Arm Pulldown (Cable)',
  'Overhead Press (Barbell)', 'Shoulder Press (Dumbbell)', 'Shoulder Press (Machine)',
  'Lateral Raise (Dumbbell)', 'Lateral Raise (Cable)', 'Lateral Raise (Machine)',
  'Single Arm Lateral Raise (Dumbbell)', 'Rear Delt Reverse Fly (Dumbbell)',
  'Rear Delt Fly (Machine)', 'Reverse Pec Deck (Machine)', 'Front Raise (Dumbbell)',
  'Upright Row (Barbell)',
  'Bicep Curl (Dumbbell)', 'Bicep Curl (Barbell)', 'Bicep Curl (Cable)',
  'Hammer Curl (Dumbbell)', 'Preacher Curl (Barbell)', 'Concentration Curl (Dumbbell)',
  'Seated Incline Curl (Dumbbell)', 'Triceps Pushdown (Cable)',
  'Single Arm Tricep Pushdown (Cable)', 'Triceps Extension (Dumbbell)',
  'Overhead Triceps Extension (Cable)', 'Skullcrusher (Barbell)', 'Wrist Curl (Dumbbell)',
  'Plank', 'Hanging Leg Raise', 'Crunch (Machine)', 'Cable Crunch', 'Russian Twist',
  'Ab Wheel', 'Ab Wheel Rollout',
]

let flagged = 0
for (const name of NAMES) {
  const id = resolveName(name)
  if (!id) continue                       // an honest miss shows up in Unidentified; not a lie
  const ex = EXIDX[id]
  const lower = name.toLowerCase().replace(/chest supported/g, ' ')
  const why = []
  if (PASSIVE.test(ex.n) && !PASSIVE.test(lower)) why.push('resolved to a stretch/pose')
  const claim = CLAIMS.find(([re]) => re.test(lower))
  if (claim && !claim[1].includes(ex.bp)) why.push(`reads like ${claim[1][0]} work but landed on "${ex.bp}"`)
  if (!why.length) continue
  flagged++
  console.log(`FLAG  ${name}\n        -> ${id} ${ex.n} [${ex.bp}]\n        ${why.join('; ')}`)
}

const missed = NAMES.filter(n => !resolveName(n))
console.log(`\n${NAMES.length - missed.length}/${NAMES.length} resolved, ${flagged} flagged`)
if (missed.length) console.log('unresolved (visible in Unidentified, not silently wrong):\n  ' + missed.join('\n  '))
process.exit(flagged ? 1 : 0)
