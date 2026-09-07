import { useMemo, useState } from 'react'
import LineChart from '../vendor/components/LineChart.jsx'
import { FIELDS, derive, weightNear } from '../lib/body.js'
import { ACTIVITY, ageFrom, targets } from '../lib/nutrition.js'

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
              <Stat label="Weight" value={fmt(now.weight, 1)} unit="kg" delta={delta(now.weight, then?.weight, 1, null)} />
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

      <Trends S={S} profile={profile} entries={entries} />

      {entries.length > 0 && (
        <section className="card">
          <h2 className="c-h">History</h2>
          <ul className="rows">
            {entries.slice(0, 20).map(m => {
              const d = derive(m, profile, weightNear(S.bodyweight, m.d))
              return (
                <li key={m.d} className="row static">
                  <span className="r-name">{m.d}</span>
                  <span className="hist-cells">
                    {m.weight ? <em>{m.weight} kg</em> : null}
                    {m.waist ? <em>waist {m.waist}</em> : null}
                    {d.bodyFat ? <em>{d.bodyFat.toFixed(1)}% bf</em> : null}
                  </span>
                  <button className="x" onClick={() => remove(m.d)} aria-label={`Delete ${m.d}`}>×</button>
                </li>
              )
            })}
          </ul>
          <p className="foot">
            Showing the most recent {Math.min(entries.length, 20)} of {entries.length}. Delete a
            reading with the ×.
          </p>
        </section>
      )}
    </>
  )
}

/**
 * The trend, which is the part of a tape measure that can be trusted.
 *
 * Single readings carry the method's full error; the direction across several does not, so the
 * chart is arguably more honest than the headline number above it. Weight comes from the whole
 * weigh-in series rather than only measurement days, since it is usually logged far more often.
 *
 * Every measurement that can be logged can be charted. Only metrics with data are offered, and
 * a metric that empties out says so in place of the chart — an earlier version returned null
 * for an empty series, which took the whole card away including the buttons, so switching
 * metric looked like the screen had broken.
 */

// Derived metrics first: they answer the question the tape was picked up for. The raw
// circumferences follow in the order they are measured.
const TRENDS = [
  { id: 'weight', label: 'Weight', unit: ' kg', dp: 1 },
  { id: 'bodyfat', label: 'Body fat', unit: '%', dp: 1 },
  { id: 'leanmass', label: 'Lean mass', unit: ' kg', dp: 1 },
  ...FIELDS.filter(f => f.key !== 'weight').map(f => ({ id: f.key, label: f.label, unit: ' cm', dp: 1 })),
]

function Trends({ S, profile, entries }) {
  const [metric, setMetric] = useState('weight')

  const at = iso => new Date(iso + 'T12:00:00').getTime()

  // Built once for every metric rather than for the selected one, because which buttons to
  // show depends on which series have anything in them.
  const all = useMemo(() => {
    const derived = entries.map(m => ({ m, v: derive(m, profile, weightNear(S.bodyweight, m.d)) }))
    const out = {}

    out.weight = (S.bodyweight || []).map(b => ({ t: at(b.d), d: b.d, y: b.w }))
    out.bodyfat = derived.filter(x => x.v.bodyFat != null)
      .map(x => ({ t: at(x.m.d), d: x.m.d, y: round1(x.v.bodyFat) }))
    out.leanmass = derived.filter(x => x.v.fatFreeKg != null)
      .map(x => ({ t: at(x.m.d), d: x.m.d, y: round1(x.v.fatFreeKg) }))

    for (const f of FIELDS) {
      if (f.key === 'weight') continue
      out[f.key] = entries.filter(m => m[f.key] > 0).map(m => ({ t: at(m.d), d: m.d, y: m[f.key] }))
    }

    for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t)
    return out
  }, [S.bodyweight, entries, profile])

  const available = TRENDS.filter(t => all[t.id]?.length)
  if (!available.length) return null

  // A metric can lose its last reading while selected — fall back rather than showing a
  // button that is on for a series nobody can see.
  const active = available.some(t => t.id === metric) ? metric : available[0].id
  const spec = TRENDS.find(t => t.id === active)
  const sorted = all[active] || []

  const first = sorted[0]?.y
  const last = sorted[sorted.length - 1]?.y
  const change = sorted.length > 1 ? last - first : null

  return (
    <section className="card">
      <h2 className="c-h">Trend</h2>
      <div className="seg wrap">
        {available.map(t => (
          <button key={t.id} className={'seg-b' + (active === t.id ? ' on' : '')} onClick={() => setMetric(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {sorted.length ? (
        <div className="chart">
          <LineChart points={sorted} h={160} unit={spec.unit} color="var(--accent)" />
        </div>
      ) : (
        <p className="p" style={{ margin: 0 }}>
          Nothing logged for {spec.label.toLowerCase()} yet. Add it under <strong>Latest → Add</strong>{' '}
          and it charts from the second reading.
        </p>
      )}

      {sorted.length > 0 && (
        <p className="foot">
          {sorted.length} reading{sorted.length === 1 ? '' : 's'} since {sorted[0].d}
          {change == null
            ? ' — one reading is a dot, not a direction.'
            : Math.abs(change) < 0.05
              ? ' — no net change.'
              : ` — ${change > 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(spec.dp)}${spec.unit.trim()}.`}
          {active === 'bodyfat' && ' A single body-fat reading carries the full error of the method; the direction across several is the trustworthy part.'}
          {active === 'leanmass' && ' Lean mass is derived from the body-fat estimate and inherits its error, so read the slope rather than the number.'}
        </p>
      )}
    </section>
  )
}

const round1 = v => Math.round(v * 10) / 10

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

// `lowerIsBetter` only decides the colour, never the sign — the number always shows the real
// direction. Pass null for a metric with no better direction: body weight moving down is a win
// on a cut and a loss on a bulk, and Baseline does not know which you are doing, so it stays
// neutral rather than asserting one.
function delta(now, before, dp, lowerIsBetter = false) {
  if (now == null || before == null) return null
  const diff = now - before
  if (Math.abs(diff) < 10 ** -dp / 2) return { dir: 'flat', text: 'no change' }
  const text = `${diff > 0 ? '+' : ''}${diff.toFixed(dp)}`
  if (lowerIsBetter === null) return { dir: 'flat', text }
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return { dir: better ? 'good' : 'bad', text }
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

      <Effects S={S} profile={p} />
    </section>
  )
}

/**
 * What the profile is actually doing, shown where it is entered.
 *
 * A form that silently feeds calculations two tabs away reads as if nothing happened. This
 * names each consequence and, when something is still missing, says exactly which field would
 * unlock it — so the form can be finished without hunting for what it was for.
 */
function Effects({ S, profile }) {
  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const goals = targets(profile, weightKg)
  const hasBodyFat = Number(profile.heightCm) > 0 && !!profile.sex

  // Naming the field that is actually missing beats restating the whole list: a form that says
  // "needs height, date of birth and sex" when two of the three are filled in reads as though
  // nothing had been saved.
  const missing = []
  if (!(Number(profile.heightCm) > 0)) missing.push('height')
  if (!profile.sex) missing.push('sex')
  if (!ageFrom(profile.dob)) missing.push('date of birth')
  if (!weightKg) missing.push('a logged body weight')

  return (
    <div className="effects">
      <h3>What this enables</h3>
      <ul className="reads">
        <li className={hasBodyFat ? 'ok' : 'flat'}>
          <strong>Body fat, BMI, lean mass, FFMI</strong> —{' '}
          {hasBodyFat
            ? 'active on Measurements, once neck and waist are logged.'
            : 'needs height and sex.'}
        </li>
        <li className={goals ? 'ok' : 'flat'}>
          <strong>Calorie and macro targets on Fuel</strong> —{' '}
          {goals
            ? `maintain about ${goals.tdee} kcal, protein ${goals.proteinLow}–${goals.proteinHigh} g.`
            : `needs ${listMissing(missing)}.`}
        </li>
        <li className={goals ? 'ok' : 'flat'}>
          <strong>The Fuel lens under Recovery</strong> —{' '}
          {goals
            ? 'intake is drawn against that burn estimate and your protein floor.'
            : 'the same fields — without them intake has no reference line to sit against.'}
        </li>
      </ul>
    </div>
  )
}

// "height and sex", not "height, sex" — this is read as a sentence, not a list.
function listMissing(items) {
  if (items.length <= 1) return items[0] || 'nothing'
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}
