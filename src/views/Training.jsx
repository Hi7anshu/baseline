import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import MuscleList from '../components/MuscleList.jsx'
import { loadOfWorkouts } from '../vendor/lib/muscles.js'
import { groupValues, SUM } from '../lib/groups.js'
import {
  hasEffort, displayScale, scaleName, toScale, isHardSet,
  effortSummary, effortHistogram, effortWeeks, MIN_RATED,
} from '../vendor/lib/effort.js'

const LENSES = [
  { id: 'volume', label: 'Volume' },
  { id: 'effort', label: 'Effort' },
]

const WINDOWS = [
  { id: 7, label: '7d' },
  { id: 14, label: '14d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
]

/** How much work went in, and how hard it was — the two halves of a training block. */
export default function Training({ S }) {
  const [lens, setLens] = useState('volume')
  return (
    <>
      <div className="seg">
        {LENSES.map(l => (
          <button key={l.id} className={'seg-b' + (lens === l.id ? ' on' : '')} onClick={() => setLens(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      {lens === 'volume' ? <Volume S={S} /> : <Effort S={S} />}
    </>
  )
}

/* ----------------------------------------------------------------- volume -- */

function Volume({ S }) {
  const [days, setDays] = useState(30)
  const [hardOnly, setHardOnly] = useState(false)

  const workouts = useMemo(() => {
    const cutoff = Date.now() - days * 86400000
    return S.workouts.filter(w => (w.start || new Date(w.d).getTime()) > cutoff)
  }, [S.workouts, days])

  const load = useMemo(
    () => loadOfWorkouts(workouts, hardOnly ? isHardSet : undefined),
    [workouts, hardOnly],
  )

  // Sets add up across a group's muscles — unlike fatigue, the total is the meaningful number.
  const groups = useMemo(() => groupValues(load, SUM).sort((a, b) => b.value - a.value), [load])
  const total = groups.reduce((a, g) => a + g.value, 0)
  const untouched = Object.values(load).filter(v => !(v > 0)).length

  return (
    <>
      <section className="card">
        <div className="seg">
          {WINDOWS.map(w => (
            <button key={w.id} className={'seg-b' + (days === w.id ? ' on' : '')} onClick={() => setDays(w.id)}>
              {w.label}
            </button>
          ))}
        </div>

        <div className="verdict">
          <div className="v-col"><span className="v-n">{workouts.length}</span><span className="v-l">sessions</span></div>
          <div className="v-col"><span className="v-n">{Math.round(total)}</span><span className="v-l">effective sets</span></div>
          <div className="v-col"><span className="v-n">{untouched}</span><span className="v-l">untouched</span></div>
        </div>

        <BodyMap className="heat-volume" load={load} />

        <label className="check">
          <input type="checkbox" checked={hardOnly} onChange={e => setHardOnly(e.target.checked)} />
          <span>Hard sets only (RPE 7+)</span>
        </label>
      </section>

      <section className="card">
        <h2 className="c-h">Sets by muscle group</h2>
        <MuscleList
          groups={groups}
          format={v => (v > 0 ? round(v) : '—')}
          stateOf={() => 'vol'}
          emptyNote="No completed work sets in this window."
        />
        <p className="foot">
          An exercise counts toward every muscle it lists as a primary or secondary target, so
          these are effective sets rather than a plain per-exercise count. Tap a group to see
          which muscles inside it are carrying the work — and which are being missed.
        </p>
      </section>
    </>
  )
}

const round = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

/* ----------------------------------------------------------------- effort -- */

function Effort({ S }) {
  const [days, setDays] = useState(90)

  const any = useMemo(() => hasEffort(S), [S])
  const scale = useMemo(() => displayScale(S), [S])
  const summary = useMemo(() => effortSummary(S, days), [S, days])
  const histogram = useMemo(() => effortHistogram(S, days), [S, days])
  const weeks = useMemo(() => effortWeeks(S, days), [S, days])

  if (!any) {
    return (
      <section className="card empty">
        <h2>No RPE logged</h2>
        <p>
          Turn on RPE in Hevy (Settings → Workout → RPE) and rate a few sets. Once they sync,
          this shows how close to failure you train and how that moves week to week.
        </p>
      </section>
    )
  }

  const peak = Math.max(1, ...histogram.map(b => b.n))

  return (
    <>
      <section className="card">
        <div className="seg">
          {[30, 90, 0].map(d => (
            <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
              {d ? `${d}d` : 'All'}
            </button>
          ))}
        </div>

        <div className="verdict">
          <div className="v-col">
            <span className="v-n">{summary.avg == null ? '—' : toScale(scale, summary.avg)}</span>
            <span className="v-l">avg {scaleName(scale)}</span>
          </div>
          <div className="v-col">
            <span className="v-n">{summary.hardPct == null ? '—' : Math.round(summary.hardPct * 100) + '%'}</span>
            <span className="v-l">hard sets</span>
          </div>
          <div className="v-col">
            <span className="v-n">{summary.rated}<small>/{summary.done}</small></span>
            <span className="v-l">rated</span>
          </div>
        </div>

        {summary.rated < MIN_RATED && (
          <p className="foot">
            Fewer than {MIN_RATED} rated sets here — averages are hidden rather than shown off a
            handful of taps.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="c-h">Spread</h2>
        <div className="hist">
          {histogram.map(b => (
            <div key={b.rir} className="hist-b">
              <div className="hist-bar" style={{ height: `${(b.n / peak) * 100}%` }} />
              <span className="hist-n">{b.n}</span>
              <span className="hist-l">{b.tail ? `${b.rir}+` : b.rir}</span>
            </div>
          ))}
        </div>
        <p className="foot">
          Reps in reserve per set. An average alone hides both failure-chasing and sandbagging —
          half your sets at 0 and half at 4 average to a healthy-looking 2.
        </p>
      </section>

      {weeks.length > 1 && (
        <section className="card">
          <h2 className="c-h">By week</h2>
          <ul className="rows">
            {weeks.slice(-10).reverse().map(w => (
              <li key={w.t} className="row">
                <span className="r-name">
                  {new Date(w.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
                <span className="bar">
                  <i className="fill vol" style={{ width: `${Math.min(100, (w.sets / 60) * 100)}%` }} />
                </span>
                <span className="r-eta">{toScale(scale, w.rir)} · {w.sets} sets</span>
              </li>
            ))}
          </ul>
          <p className="foot">
            Volume up with effort up is fatigue accumulating. Volume up with effort flat is the
            adaptation you were training for.
          </p>
        </section>
      )}
    </>
  )
}
