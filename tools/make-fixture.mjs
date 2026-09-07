// Build a Hevy-shaped CSV export to exercise every path in the app: warmups, RPE, a bodyweight
// lift, a cardio entry, an exercise the catalogue will not match, and enough history that
// detraining shows on some muscles while others are still fatigued.
import { writeFileSync } from 'node:fs'

const HEADER = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'

const DAYS = {
  Push: [
    ['Bench Press (Barbell)', 60, 8, [40, 60]],
    ['Incline Bench Press (Dumbbell)', 24, 10, [12]],
    ['Overhead Press (Barbell)', 35, 8, [20]],
    ['Lateral Raise (Dumbbell)', 10, 15, []],
    ['Triceps Pushdown (Cable)', 30, 12, []],
  ],
  Pull: [
    ['Deadlift (Barbell)', 110, 5, [60, 90]],
    ['Lat Pulldown (Cable)', 60, 10, [40]],
    ['Bent Over Row (Barbell)', 60, 8, [40]],
    ['Face Pull (Cable)', 20, 15, []],
    ['Bicep Curl (Dumbbell)', 12, 12, []],
  ],
  Legs: [
    ['Squat (Barbell)', 90, 6, [40, 70]],
    ['Romanian Deadlift (Barbell)', 70, 8, [50]],
    ['Leg Press (Machine)', 160, 12, []],
    ['Leg Curl (Machine)', 40, 12, []],
    ['Standing Calf Raise (Machine)', 60, 15, []],
  ],
  Upper: [
    ['Pull Up', 0, 8, []],                      // bodyweight: no load logged
    ['Chest Press (Machine)', 55, 10, []],
    ['Seated Row (Cable)', 55, 10, []],
    ['Lateral Raise (Dumbbell)', 10, 15, []],
    ['Hitanshu Special Carry', 30, 20, []],     // deliberately unmatchable
  ],
  Conditioning: [
    ['Treadmill', null, null, []],              // cardio: distance + duration
    ['Plank', 0, null, []],                     // timed hold
  ],
}

const ORDER = ['Push', 'Pull', 'Legs', 'Upper', 'Conditioning']
const pad = n => String(n).padStart(2, '0')
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const esc = v => (v === null || v === undefined ? '' : /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

const rows = [HEADER]
const today = new Date()
today.setHours(19, 0, 0, 0)

// Eight weeks back, five sessions a week, skipping Conditioning in the newest week so cardio
// muscles have had time to decay while the lifting muscles have not.
for (let week = 7; week >= 0; week--) {
  ORDER.forEach((day, i) => {
    const when = new Date(today)
    when.setDate(when.getDate() - (week * 7 + (4 - i)))
    if (when > today) return

    const end = new Date(when)
    end.setMinutes(end.getMinutes() + 68)
    const progress = 1 + (7 - week) * 0.012      // slow linear overload across the block

    DAYS[day].forEach(([name, base, reps, warmups]) => {
      let index = 0
      for (const w of warmups) {
        rows.push([
          day, stamp(when), stamp(end), '', name, '', '',
          index++, 'warmup', Math.round(w * progress), reps + 4, '', '', '',
        ].map(esc).join(','))
      }

      if (name === 'Treadmill') {
        rows.push([day, stamp(when), stamp(end), '', name, '', '', index++, 'normal', '', '', 4.5, 1500, ''].map(esc).join(','))
        return
      }
      if (name === 'Plank') {
        for (let s = 0; s < 3; s++) {
          rows.push([day, stamp(when), stamp(end), '', name, '', '', index++, 'normal', '', '', '', 60, ''].map(esc).join(','))
        }
        return
      }

      for (let s = 0; s < 3; s++) {
        const load = base ? Math.round(base * progress) : ''
        rows.push([
          day, stamp(when), stamp(end), '', name, '', '',
          index++, 'normal', load, Math.max(4, reps - s), '', '',
          [8, 8.5, 9][s],                          // RPE climbs across the sets
        ].map(esc).join(','))
      }
    })
  })
}

const out = process.argv[2] || process.argv[2] || 'hevy-fixture.csv'
writeFileSync(out, rows.join('\n'))
console.log(`wrote ${out}: ${rows.length - 1} set rows`)
