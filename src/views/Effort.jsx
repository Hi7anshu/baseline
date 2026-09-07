import { useMemo, useState } from 'react'
import {
  hasEffort, displayScale, scaleName, toScale,
  effortSummary, effortHistogram, effortWeeks, MIN_RATED,
} from '../vendor/lib/effort.js'

const WINDOWS = [
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
  { id: 0, label: 'All' },
]

/**
 * How hard the training actually was.
 *
 * Hevy records an RPE per set; everything here aggregates in RIR internally and converts back,
 * so a history that mixes the two scales still draws one series instead of two half-empty ones.
 * The rated-set count is shown next to every average on purpose — RPE is optional, so a mean
 * without its denominator would quietly speak for sets nobody rated.
 */
export default function Effort({ S }) {
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
          this tab shows how close to failure you are training and how that trend moves week to week.
        </p>
      </section>
    )
  }

  const peak = Math.max(1, ...histogram.map(b => b.n))

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
            Fewer than {MIN_RATED} rated sets in this window — averages are hidden rather than
            shown off a handful of taps.
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
                <span className="r-name">{new Date(w.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <span className="bar"><i className="fill vol" style={{ width: `${Math.min(100, (w.sets / 60) * 100)}%` }} /></span>
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
