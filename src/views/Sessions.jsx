import { useMemo, useState } from 'react'
import LineChart from '../vendor/components/LineChart.jsx'
import { exOr } from '../vendor/lib/exercises.js'
import { isWarmupRow } from '../vendor/lib/workout-model.js'
import { loadOfWorkouts } from '../vendor/lib/muscles.js'
import { groupValues, SUM } from '../lib/groups.js'
import { hardSets } from '../lib/fuel.js'

/**
 * Turning up, week by week, and what each session actually was.
 *
 * The other lenses are all derived: fatigue, estimates, averages. This one is the log itself —
 * the grid answers "did I train", the line answers "is the workload going anywhere", and the
 * list answers "what did I actually do on the ninth". Nothing here is modelled, which is why it
 * is worth having next to three screens that are.
 */
export default function Sessions({ S }) {
  const sorted = useMemo(
    () => [...(S.workouts || [])].sort((a, b) => (a.d < b.d ? 1 : -1)),
    [S.workouts],
  )

  if (!sorted.length) {
    return (
      <section className="card empty">
        <h2>No sessions yet</h2>
        <p>Import a Hevy export and every workout in it shows up here.</p>
      </section>
    )
  }

  return (
    <>
      <Consistency workouts={sorted} />
      <WeeklyVolume workouts={sorted} />
      <SessionList workouts={sorted} />
    </>
  )
}

/* ----------------------------------------------------------- consistency -- */

const WEEKS = 16
const DAY_MS = 86400000

// Monday-first: a training week is planned Monday to Sunday, and a grid that breaks on Sunday
// splits every weekend session away from the week it belonged to.
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const startOfWeek = ms => {
  const d = new Date(ms)
  d.setHours(12, 0, 0, 0)
  const shift = (d.getDay() + 6) % 7
  return d.getTime() - shift * DAY_MS
}

const isoOf = ms => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Did I turn up.
 *
 * Shaded by working sets rather than marked present/absent, because a fifteen-set session and a
 * four-set session are not the same attendance, and a grid that says they are flatters a bad
 * month. Empty days are drawn rather than skipped — the gaps are the information.
 */
function Consistency({ workouts }) {
  const { cells, weeks, streak, trained, sessions } = useMemo(() => {
    const byDay = new Map()
    for (const w of workouts) byDay.set(w.d, (byDay.get(w.d) || 0) + hardSets(w))

    const thisWeek = startOfWeek(Date.now())
    const first = thisWeek - (WEEKS - 1) * 7 * DAY_MS
    const cells = []
    for (let i = 0; i < WEEKS * 7; i++) {
      const t = first + i * DAY_MS
      const iso = isoOf(t)
      cells.push({ t, iso, sets: byDay.get(iso) || 0, future: t > Date.now() + DAY_MS })
    }

    const max = Math.max(1, ...cells.map(c => c.sets))

    // Consecutive weeks with at least one session, counted back from the current one. The
    // current week is excluded from breaking the streak until it ends, since a streak that
    // resets every Monday morning would only ever read zero.
    let streak = 0
    for (let wk = WEEKS - 1; wk >= 0; wk--) {
      const slice = cells.slice(wk * 7, wk * 7 + 7)
      const any = slice.some(c => c.sets > 0)
      if (any) streak++
      else if (wk < WEEKS - 1) break
    }

    return {
      cells: cells.map(c => ({ ...c, level: c.sets === 0 ? 0 : Math.min(4, 1 + Math.floor((c.sets / max) * 3.99)) })),
      weeks: WEEKS,
      streak,
      trained: cells.filter(c => c.sets > 0).length,
      sessions: workouts.length,
    }
  }, [workouts])

  return (
    <section className="card">
      <h2 className="c-h">Turning up</h2>
      <div className="verdict">
        <div className="v-col"><span className="v-n">{streak}</span><span className="v-l">week streak</span></div>
        <div className="v-col"><span className="v-n">{trained}</span><span className="v-l">days trained</span></div>
        <div className="v-col"><span className="v-n">{sessions}</span><span className="v-l">sessions logged</span></div>
      </div>

      <div className="heat">
        <div className="heat-days">
          {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="heat-grid">
          {Array.from({ length: weeks }, (_, wk) => (
            <div key={wk} className="heat-col">
              {cells.slice(wk * 7, wk * 7 + 7).map(c => (
                <i
                  key={c.iso}
                  className={`heat-c l${c.level}` + (c.future ? ' future' : '')}
                  title={c.sets ? `${c.iso} — ${c.sets} sets` : c.iso}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="foot">
        {weeks} weeks, one column each, Monday at the top. Shaded by working sets, so a short
        session and a long one do not read the same. The streak counts consecutive weeks with at
        least one session and does not break on the week in progress.
      </p>
    </section>
  )
}

/* --------------------------------------------------------- weekly volume -- */

/**
 * Is the workload going anywhere.
 *
 * Weekly rather than per-session, because sessions move around inside a week and a per-session
 * line mostly draws the split rather than the trend. The current week is left out: it is
 * always partial, and a half-finished week plotted next to whole ones reads as a collapse.
 */
function WeeklyVolume({ workouts }) {
  const [group, setGroup] = useState('all')

  const { points, groups, mean } = useMemo(() => {
    const thisWeek = startOfWeek(Date.now())
    const buckets = new Map()

    const seen = new Set()
    for (const w of workouts) {
      const t = startOfWeek(w.start || new Date(w.d + 'T12:00:00').getTime())
      if (t >= thisWeek) continue

      const row = buckets.get(t) || { t, all: 0, byGroup: {} }
      row.all += hardSets(w)
      for (const g of groupValues(loadOfWorkouts([w]), SUM)) {
        if (g.value > 0) {
          row.byGroup[g.id] = (row.byGroup[g.id] || 0) + g.value
          seen.add(`${g.id}|${g.name}`)
        }
      }
      buckets.set(t, row)
    }

    const rows = [...buckets.values()].sort((a, b) => a.t - b.t)
    const value = r => (group === 'all' ? r.all : r.byGroup[group] || 0)
    const points = rows.map(r => ({
      t: r.t,
      d: isoOf(r.t),
      y: Math.round(value(r) * 10) / 10,
    }))
    const vals = points.map(p => p.y)

    return {
      points,
      groups: [...seen].map(s => { const [id, name] = s.split('|'); return { id, name } }),
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    }
  }, [workouts, group])

  if (points.length < 2) {
    return (
      <section className="card">
        <h2 className="c-h">Weekly volume</h2>
        <p className="p">Two completed weeks are needed before this says anything. The current week is left out until it finishes.</p>
      </section>
    )
  }

  const last = points[points.length - 1].y
  const prev = points[points.length - 2].y
  const change = last - prev

  return (
    <section className="card">
      <h2 className="c-h">Weekly volume</h2>
      <div className="seg wrap">
        <button className={'seg-b' + (group === 'all' ? ' on' : '')} onClick={() => setGroup('all')}>All</button>
        {groups.map(g => (
          <button key={g.id} className={'seg-b' + (group === g.id ? ' on' : '')} onClick={() => setGroup(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="chart">
        <LineChart points={points} h={160} unit=" sets" color="var(--accent)" goal={mean ? Math.round(mean) : null} />
      </div>
      <p className="foot">
        {group === 'all' ? 'Working sets' : 'Effective sets'} per completed week; the dashed line
        is your {Math.round(mean)}-set average over {points.length} weeks. Last full week{' '}
        {Math.abs(change) < 0.5 ? 'held level' : change > 0 ? `was ${round1(change)} up` : `was ${round1(-change)} down`}
        {' '}on the one before.
        {group !== 'all' && ' Effective sets weight each set by how much of the exercise that group actually is, so a bench press is not a whole set of triceps.'}
      </p>
    </section>
  )
}

/* ------------------------------------------------------------- the log -- */

function SessionList({ workouts }) {
  const [open, setOpen] = useState(null)
  const [limit, setLimit] = useState(15)

  return (
    <section className="card">
      <h2 className="c-h">Sessions</h2>
      <ul className="rows grouped">
        {workouts.slice(0, limit).map(w => {
          const isOpen = open === w.id
          const sets = hardSets(w)
          const mins = w.end && w.start ? Math.round((w.end - w.start) / 60000) : null
          const top = groupValues(loadOfWorkouts([w]), SUM)
            .filter(g => g.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)

          return (
            <li key={w.id} className="group">
              <div
                className={'row lift-row' + (isOpen ? ' open' : '')}
                onClick={() => setOpen(o => (o === w.id ? null : w.id))}
              >
                <span className="r-name">
                  <span className={'caret' + (isOpen ? ' on' : '')} aria-hidden="true">›</span>
                  <span className="lift-n">{w.name || 'Workout'}</span>
                </span>
                <span className="lift-v">{sets}<small>sets</small></span>
                <span className="r-eta">{shortDate(w.d)}</span>
              </div>

              {isOpen && (
                <div className="lift-detail">
                  <div className="d-grid">
                    <div><span className="k">Sets</span><span className="v">{sets}</span></div>
                    <div><span className="k">Exercises</span><span className="v">{w.entries?.length || 0}</span></div>
                    <div><span className="k">Time</span><span className="v">{mins ? <>{mins}<small>min</small></> : '—'}</span></div>
                  </div>
                  {top.length > 0 && (
                    <div className="chips" style={{ marginTop: 12 }}>
                      {top.map(g => <span key={g.id} className="chip">{g.name} {round1(g.value)}</span>)}
                    </div>
                  )}
                  <ul className="rows sub" style={{ marginTop: 10 }}>
                    {(w.entries || []).map((e, i) => (
                      <li key={i} className="row sub-row static">
                        <span className="r-name">{exOr(e.id).n}</span>
                        <span className="hist-cells">
                          <em>{summariseSets(e)}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {workouts.length > limit && (
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setLimit(n => n + 25)}>
          Show older ({workouts.length - limit} more)
        </button>
      )}
      <p className="foot">
        Straight from your Hevy log, warm-ups excluded from the set counts. Tap a session to see
        the exercises and the working sets in it.
      </p>
    </section>
  )
}

/**
 * One line for an exercise's working sets.
 *
 * Identical sets collapse — "60 kg × 10 ×3" rather than the same line three times — because a
 * straight-sets session is the common case and printing it out in full turns a glance into
 * reading. Timed and cardio sets carry no weight-and-reps pair and are counted instead.
 */
function summariseSets(entry) {
  const sets = (entry.sets || []).filter(s => s.done && !isWarmupRow(s))
  if (!sets.length) return '—'

  const parts = []
  for (const s of sets) {
    const label = s.w > 0 && s.r >= 1
      ? `${round1(s.w)} kg × ${Math.round(s.r)}`
      : s.r >= 1 ? `× ${Math.round(s.r)}`
        : s.sec ? `${Math.round(s.sec)}s`
          : '·'
    const last = parts[parts.length - 1]
    if (last && last.label === label) last.n++
    else parts.push({ label, n: 1 })
  }
  return parts.map(p => (p.n > 1 ? `${p.label} ×${p.n}` : p.label)).join(', ')
}

const round1 = v => Math.round(v * 10) / 10
const shortDate = iso =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
