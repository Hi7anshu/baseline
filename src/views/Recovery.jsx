import { useMemo, useState } from 'react'
import BodyMap from '../vendor/components/BodyMap.jsx'
import { MUSCLE_NAME, musclesOf } from '../vendor/lib/muscles.js'
import { exOr } from '../vendor/lib/exercises.js'
import { recoveryRows, fmtEta, STATE_LABEL, FATIGUE_THRESHOLDS } from '../lib/eta.js'

/**
 * What is still recovering, and when it clears.
 *
 * The body map answers "what did I cook"; the list answers "what can I train today", which is
 * the question that actually picks tonight's session. Sorted worst-first so the answer is the
 * top of the screen rather than something to scan for.
 */
export default function Recovery({ S, now, fatigue }) {
  const [selected, setSelected] = useState(null)

  const rows = useMemo(
    () => recoveryRows(fatigue).sort((a, b) => b.value - a.value),
    [fatigue],
  )

  const fatigued = rows.filter(r => r.state === 'fatigued')
  const ready = rows.filter(r => r.state === 'ready')
  const detail = selected ? rows.find(r => r.slug === selected) : null

  // The last session that actually loaded this muscle — the "why is it red" answer. Membership
  // goes through musclesOf so the catalogue's own aliases apply: a pull-up is filed under "lats",
  // which is the same muscle the map shades as "upper back".
  const lastHit = useMemo(() => {
    if (!selected) return null
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const w = S.workouts[i]
      const names = (w.entries || [])
        .map(e => exOr(e.id))
        .filter(ex => (musclesOf(ex)[selected] || 0) > 0)
        .map(ex => ex.n)
      if (names.length) return { w, names }
    }
    return null
  }, [selected, S.workouts])

  return (
    <>
      <section className="card">
        <div className="verdict">
          <div className="v-col">
            <span className="v-n">{ready.length}</span>
            <span className="v-l ready">ready</span>
          </div>
          <div className="v-col">
            <span className="v-n">{rows.length - ready.length - fatigued.length}</span>
            <span className="v-l recovering">recovering</span>
          </div>
          <div className="v-col">
            <span className="v-n">{fatigued.length}</span>
            <span className="v-l fatigued">fatigued</span>
          </div>
        </div>

        <BodyMap
          load={fatigue}
          thresholds={FATIGUE_THRESHOLDS}
          onMuscle={slug => setSelected(s => (s === slug ? null : slug))}
          selected={selected}
        />

        <div className="scale">
          <span>Fresh</span>
          <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" />
          <div className="hm-c l3" /><div className="hm-c l4" />
          <span>Fatigued</span>
        </div>
      </section>

      {detail && (
        <section className="card detail">
          <div className="d-head">
            <h2>{MUSCLE_NAME[detail.slug]}</h2>
            <span className={'pill ' + detail.state}>{STATE_LABEL[detail.state]}</span>
          </div>
          <div className="d-grid">
            <div><span className="k">Fatigue</span><span className="v">{Math.round(detail.value * 100)}%</span></div>
            <div><span className="k">Eases in</span><span className="v">{fmtEta(detail.easesIn)}</span></div>
            <div><span className="k">Fully ready</span><span className="v">{fmtEta(detail.readyIn)}</span></div>
          </div>
          {lastHit && (
            <p className="d-last">
              Last loaded {relDay(lastHit.w.d, now)} — {lastHit.names.slice(0, 3).join(', ')}
              {lastHit.names.length > 3 ? ` +${lastHit.names.length - 3} more` : ''}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="c-h">Every muscle</h2>
        <ul className="rows">
          {rows.map(r => (
            <li
              key={r.slug}
              className={'row' + (selected === r.slug ? ' on' : '')}
              onClick={() => setSelected(s => (s === r.slug ? null : r.slug))}
            >
              <span className="r-name">{MUSCLE_NAME[r.slug]}</span>
              <span className="bar"><i className={'fill ' + r.state} style={{ width: pct(r.value) }} /></span>
              <span className={'r-eta ' + r.state}>{r.readyIn ? fmtEta(r.readyIn) : '—'}</span>
            </li>
          ))}
        </ul>
        <p className="foot">
          Fatigue decays on a 36-hour half-life and is scored against your own recent sessions, so
          a hard week raises the bar rather than pinning everything red.
        </p>
      </section>
    </>
  )
}

const pct = v => `${Math.max(2, Math.round(v * 100))}%`

function relDay(iso, now) {
  const days = Math.floor((now - new Date(iso + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
