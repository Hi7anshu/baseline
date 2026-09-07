import { useMemo, useState } from 'react'
import { FIELDS, derive, weightNear } from '../lib/body.js'
import { ACTIVITY, ageFrom } from '../lib/nutrition.js'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Measurements, and what can honestly be derived from them.
 *
 * Hevy puts everything past weight and waist behind Pro, which is the whole reason this exists.
 * The ordering of the readout is deliberate: waist-to-height needs no equation and no
 * assumptions, so it leads; body fat is a curve fit off a tape measure and is labelled as an
 * estimate; lean mass and FFMI inherit that error and sit last.
 */
export default function Body({ S, commitState }) {
  const [tab, setTab] = useState('log')

  return (
    <>
      <div className="seg">
        <button className={'seg-b' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}>Measurements</button>
        <button className={'seg-b' + (tab === 'profile' ? ' on' : '')} onClick={() => setTab('profile')}>Profile</button>
      </div>
      {tab === 'log' ? <Log S={S} commitState={commitState} /> : <Profile S={S} commitState={commitState} />}
    </>
  )
}

/* ------------------------------------------------------------------- log -- */

function Log({ S, commitState }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO)
  const [vals, setVals] = useState({})

  const profile = S.profile || {}
  const entries = useMemo(
    () => [...(S.measurements || [])].sort((a, b) => (a.d < b.d ? 1 : -1)),
    [S.measurements],
  )

  const latest = entries[0] || null
  const previous = entries[1] || null

  const now = useMemo(
    () => (latest ? derive(latest, profile, weightNear(S.bodyweight, latest.d)) : null),
    [latest, profile, S.bodyweight],
  )
  const then = useMemo(
    () => (previous ? derive(previous, profile, weightNear(S.bodyweight, previous.d)) : null),
    [previous, profile, S.bodyweight],
  )

  async function save() {
    const entry = { d: date }
    let any = false
    for (const f of FIELDS) {
      const n = Number(vals[f.key])
      if (Number.isFinite(n) && n > 0) { entry[f.key] = n; any = true }
    }
    if (!any) return

    const measurements = [...(S.measurements || []).filter(m => m.d !== date), entry]
      .sort((a, b) => (a.d < b.d ? -1 : 1))

    // A weight typed here belongs in the weight series too — that is what the fatigue model
    // reads for bodyweight exercises, and keeping two separate weight histories would guarantee
    // they disagree.
    let bodyweight = S.bodyweight || []
    if (entry.weight) {
      bodyweight = [...bodyweight.filter(b => b.d !== date), { d: date, w: entry.weight }]
        .sort((a, b) => (a.d < b.d ? -1 : 1))
    }

    await commitState({ ...S, measurements, bodyweight })
    setVals({})
    setOpen(false)
  }

  async function remove(d) {
    if (!confirm(`Delete the measurement from ${d}?`)) return
    await commitState({ ...S, measurements: (S.measurements || []).filter(m => m.d !== d) })
  }

  const needsProfile = !(Number(profile.heightCm) > 0) || !profile.sex

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Latest</h2>
          <button className="btn small primary" onClick={() => setOpen(o => !o)}>
            {open ? 'Cancel' : 'Add'}
          </button>
        </div>

        {open && (
          <div className="form">
            <label className="field">
              <span>Date</span>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <div className="field-grid">
              {FIELDS.map(f => (
                <label key={f.key} className="field">
                  <span>{f.label} <em>{f.unit}</em></span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    placeholder={f.hint || ''}
                    value={vals[f.key] ?? ''}
                    onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <button className="btn primary" onClick={save}>Save measurement</button>
          </div>
        )}

        {!open && !latest && (
          <p className="p">
            Nothing logged yet. Weight and waist alone already give you a trend; add neck as well
            and body fat becomes available.
          </p>
        )}

        {!open && latest && (
          <>
            <div className="stat-grid">
              <Stat label="Weight" value={fmt(now.weight, 1)} unit="kg" delta={delta(now.weight, then?.weight, 1)} />
              <Stat label="Waist : height" value={fmt(now.whtr, 2)} good={now.whtr != null && now.whtr < 0.5}
                delta={delta(now.whtr, then?.whtr, 2, true)} />
              <Stat label="Body fat" value={fmt(now.bodyFat, 1)} unit="%" estimate
                delta={delta(now.bodyFat, then?.bodyFat, 1, true)} />
              <Stat label="Lean mass" value={fmt(now.fatFreeKg, 1)} unit="kg" estimate
                delta={delta(now.fatFreeKg, then?.fatFreeKg, 1)} />
              <Stat label="BMI" value={fmt(now.bmi, 1)} />
              <Stat label="FFMI" value={fmt(now.ffmi, 1)} estimate />
            </div>
            <p className="foot">
              Measured {latest.d}{previous ? `, compared with ${previous.d}` : ''}.
              {' '}Waist-to-height needs no formula and is the number to trust; under 0.5 is the
              usual guideline. Body fat is a tape-measure estimate — good to roughly ±3–4 points
              on the absolute value, but reliable on direction, so watch the trend rather than
              the digit. Lean mass and FFMI are derived from it and carry the same error.
            </p>
          </>
        )}

        {needsProfile && (
          <div className="note busy" style={{ marginTop: 12 }}>
            Set your height and sex under <strong>Profile</strong> — body fat and BMI need both.
          </div>
        )}
      </section>

      {entries.length > 0 && (
        <section className="card">
          <h2 className="c-h">History</h2>
          <ul className="rows">
            {entries.slice(0, 20).map(m => {
              const d = derive(m, profile, weightNear(S.bodyweight, m.d))
              return (
                <li key={m.d} className="row" onClick={() => remove(m.d)}>
                  <span className="r-name">{m.d}</span>
                  <span className="hist-cells">
                    {m.weight ? <em>{m.weight} kg</em> : null}
                    {m.waist ? <em>waist {m.waist}</em> : null}
                    {d.bodyFat ? <em>{d.bodyFat.toFixed(1)}% bf</em> : null}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="foot">Tap a row to delete it.</p>
        </section>
      )}
    </>
  )
}

function Stat({ label, value, unit, delta, estimate, good }) {
  return (
    <div className="stat">
      <span className="stat-l">{label}{estimate && <span className="est" title="estimate">≈</span>}</span>
      <span className={'stat-v' + (good ? ' good' : '')}>
        {value}{value !== '—' && unit ? <small>{unit}</small> : null}
      </span>
      {delta && <span className={'stat-d ' + delta.dir}>{delta.text}</span>}
    </div>
  )
}

const fmt = (v, dp = 1) => (v == null ? '—' : Number(v).toFixed(dp))

// `lowerIsBetter` only decides the colour, never the sign — the arrow always shows the real
// direction of change.
function delta(now, before, dp, lowerIsBetter = false) {
  if (now == null || before == null) return null
  const diff = now - before
  if (Math.abs(diff) < 10 ** -dp / 2) return { dir: 'flat', text: 'no change' }
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return {
    dir: better ? 'good' : 'bad',
    text: `${diff > 0 ? '+' : ''}${diff.toFixed(dp)}`,
  }
}

/* --------------------------------------------------------------- profile -- */

function Profile({ S, commitState }) {
  const p = S.profile || {}
  const set = async patch => commitState({ ...S, profile: { ...p, ...patch } })
  const age = ageFrom(p.dob)

  return (
    <section className="card">
      <h2 className="c-h">Profile</h2>
      <p className="p">
        Used only for the calculations on this device. Height and sex are what the body-fat and
        BMI equations need; date of birth and activity feed the calorie estimate on Fuel.
      </p>

      <label className="field">
        <span>Height <em>cm</em></span>
        <input
          className="input" type="number" inputMode="decimal" step="0.5" placeholder="e.g. 175"
          value={p.heightCm ?? ''}
          onChange={e => set({ heightCm: e.target.value ? Number(e.target.value) : null })}
        />
      </label>

      <label className="field">
        <span>Sex</span>
        <div className="seg">
          {['male', 'female'].map(s => (
            <button key={s} className={'seg-b' + (p.sex === s ? ' on' : '')} onClick={() => set({ sex: s })}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <em className="foot" style={{ margin: '6px 0 0' }}>
          The Navy body-fat equation is fitted separately per sex; there is no neutral form of it.
        </em>
      </label>

      <label className="field">
        <span>Date of birth {age ? <em>— {age} years</em> : null}</span>
        <input
          className="input" type="date" value={p.dob ?? ''}
          onChange={e => set({ dob: e.target.value || null })}
        />
      </label>

      <label className="field">
        <span>Activity</span>
        <select
          className="input"
          value={p.activity ?? 1.55}
          onChange={e => set({ activity: Number(e.target.value) })}
        >
          {ACTIVITY.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>
    </section>
  )
}
