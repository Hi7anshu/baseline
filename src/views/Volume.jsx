import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../vendor/lib/muscles.js'
import { isHardSet } from '../vendor/lib/effort.js'

const WINDOWS = [
  { id: 7, label: '7d' },
  { id: 14, label: '14d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
]

/**
 * Effective sets per muscle — the number Hevy already gives you, but spread across every muscle
 * an exercise actually works rather than only the one it is filed under.
 *
 * Shading here is deliberately relative, not absolute: this map is about balance, so the
 * question it answers is "what am I under-training compared to the rest", and renormalising to
 * the hardest-worked muscle is what makes that legible.
 */
export default function Volume({ S }) {
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
  const { worked, missed } = useMemo(() => rankOf(load), [load])
  const total = worked.reduce((a, m) => a + load[m], 0)

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
          <div className="v-col"><span className="v-n">{missed.length}</span><span className="v-l">untouched</span></div>
        </div>

        <BodyMap load={load} />

        <label className="check">
          <input type="checkbox" checked={hardOnly} onChange={e => setHardOnly(e.target.checked)} />
          <span>Hard sets only (RPE 7+)</span>
        </label>
      </section>

      <section className="card">
        <h2 className="c-h">Worked</h2>
        {worked.length ? (
          <ul className="rows">
            {worked.map(slug => (
              <li key={slug} className="row">
                <span className="r-name">{MUSCLE_NAME[slug]}</span>
                <span className="bar">
                  <i className="fill vol" style={{ width: `${Math.max(2, (load[slug] / load[worked[0]]) * 100)}%` }} />
                </span>
                <span className="r-eta">{round(load[slug])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="foot">No completed work sets in this window.</p>
        )}
      </section>

      {missed.length > 0 && (
        <section className="card">
          <h2 className="c-h">Untouched in {days} days</h2>
          <div className="chips">
            {missed.map(slug => <span key={slug} className="chip">{MUSCLE_NAME[slug]}</span>)}
          </div>
          <p className="foot">
            A muscle counts as worked when an exercise lists it as a primary or secondary target,
            so this is a stricter read than a per-exercise set count.
          </p>
        </section>
      )}
    </>
  )
}

const round = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)
