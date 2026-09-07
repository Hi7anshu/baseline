import { useMemo, useState } from 'react'
import LineChart from '../vendor/components/LineChart.jsx'
import { strengthProgress, recentRecords, movers, REP_CAP } from '../lib/strength.js'

const WINDOWS = [
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
  { id: 365, label: '1y' },
  { id: 0, label: 'All' },
]

/**
 * Estimated one-rep max per lift, over time.
 *
 * The question the rest of the app cannot answer: fatigue says what is recoverable, volume says
 * what was done, and neither says whether any of it is working. Sorted by most recently trained
 * so the programme you are running now is at the top, rather than whichever abandoned lift has
 * the prettiest line.
 */
export default function Strength({ S }) {
  const [days, setDays] = useState(90)
  const [open, setOpen] = useState(null)

  const rows = useMemo(() => strengthProgress(S, days), [S, days])
  const prs = useMemo(() => recentRecords(rows), [rows])
  const { gained, lost } = useMemo(() => movers(rows), [rows])

  if (!rows.length) {
    return (
      <section className="card empty">
        <h2>No estimates yet</h2>
        <p>
          An estimated 1RM needs a weight and a rep count, at {REP_CAP} reps or fewer. Bodyweight
          work, timed holds and high-rep isolation sets do not produce one — so this fills in as
          you log loaded sets in the working range.
        </p>
      </section>
    )
  }

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
          <div className="v-col"><span className="v-n">{rows.length}</span><span className="v-l">lifts tracked</span></div>
          <div className="v-col"><span className="v-n">{prs.length}</span><span className="v-l ready">at best</span></div>
          <div className="v-col"><span className="v-n">{lost.length}</span><span className="v-l fatigued">going back</span></div>
        </div>

        {(gained.length > 0 || lost.length > 0) && (
          <ul className="reads">
            {gained.length > 0 && (
              <li className="ok">
                <strong>Up:</strong>{' '}
                {gained.slice(0, 3).map(r => `${r.name} +${Math.round(r.pct * 100)}%`).join(', ')}
                {gained.length > 3 ? `, and ${gained.length - 3} more` : ''}.
              </li>
            )}
            {lost.length > 0 && (
              <li className="low">
                <strong>Down:</strong>{' '}
                {lost.slice(0, 3).map(r => `${r.name} ${Math.round(r.pct * 100)}%`).join(', ')}
                {lost.length > 3 ? `, and ${lost.length - 3} more` : ''}.
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="c-h">By lift · estimated 1RM</h2>
        <p className="p">
          Every number in this list is an <strong>estimated one-rep max</strong> (≈), not a weight
          you have lifted. A best set of 30 kg × 10 estimates a 40 kg single — the 40 is a
          projection off ten reps, and the set behind it is shown when you open a lift.
        </p>
        <ul className="rows grouped">
          {rows.map(r => {
            const isOpen = open === r.id
            return (
              <li key={r.id} className="group">
                <div
                  className={'row lift-row' + (isOpen ? ' open' : '')}
                  onClick={() => setOpen(o => (o === r.id ? null : r.id))}
                >
                  <span className="r-name">
                    <span className={'caret' + (isOpen ? ' on' : '')} aria-hidden="true">›</span>
                    <span className="lift-n">{r.name}</span>
                  </span>
                  <span className="lift-v">
                    <span className="est" title="estimated one-rep max">≈</span>
                    {r.latest.y}<small>kg</small>
                    {r.recentPr && <span className="tag pr">PR</span>}
                    {r.stalled && <span className="tag stall">stalled</span>}
                  </span>
                  <span className={'r-eta ' + trendClass(r.pct)}>{fmtChange(r)}</span>
                </div>

                {isOpen && (
                  <div className="lift-detail">
                    <div className="chart">
                      <LineChart points={r.points} h={150} unit=" kg" color="var(--accent)" />
                    </div>
                    <div className="d-grid">
                      <div>
                        <span className="k">Latest e1RM</span>
                        <span className="v">≈{r.latest.y}<small>kg</small></span>
                      </div>
                      <div>
                        <span className="k">Best e1RM</span>
                        <span className="v">{r.best ? <>≈{r.best.est}</> : '—'}<small>kg</small></span>
                      </div>
                      <div>
                        <span className="k">Heaviest set</span>
                        <span className="v">
                          {r.heaviest ? <>{r.heaviest.w}<small>kg × {r.heaviest.r}</small></> : '—'}
                        </span>
                      </div>
                    </div>
                    <p className="foot">
                      Latest estimate from {r.latest.w} kg × {r.latest.r} on {r.latest.d}.
                      {r.best && (
                        <> Best estimate from {r.best.w} kg × {r.best.r} on {r.best.d}.</>
                      )}
                      {r.heaviest && (
                        <> Heaviest load actually moved: {r.heaviest.w} kg × {r.heaviest.r} on {r.heaviest.d}.</>
                      )}
                      {r.stalled && ' No new best in over six weeks.'}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="foot">
          Estimated one-rep max, Epley — weight × (1 + reps ÷ 30) — from the best working set of
          each session, which is why the figure sits above anything on the bar for any set past a
          single. Sets above{' '}
          {REP_CAP} reps produce no estimate — the formulas disagree by double digits up there and
          the number stops describing strength — so high-rep isolation work will be missing from
          this list. Warm-ups are excluded. An estimate off {REP_CAP} reps is a weaker claim than
          one off a heavy triple, so the set behind each number is shown.
        </p>
      </section>
    </>
  )
}

const trendClass = pct => (pct == null ? '' : pct > 0.02 ? 'up' : pct < -0.02 ? 'down' : '')

function fmtChange(r) {
  if (r.change == null) return 'first'
  if (Math.abs(r.change) < 0.05) return 'flat'
  const sign = r.change > 0 ? '+' : ''
  return `${sign}${r.change.toFixed(1)} kg`
}
