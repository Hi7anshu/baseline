import { useMemo, useState } from 'react'
import {
  parseMacros, kcalFromMacros, summarise, estimateTdee,
  proteinVerdict, PROTEIN_LOW,
} from '../lib/nutrition.js'
import { loadOfWorkouts } from '../vendor/lib/muscles.js'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MACROS = [
  { key: 'kcal', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

/**
 * What went in, next to what went out.
 *
 * This deliberately stops short of scoring recovery from food. Intake and training volume are
 * shown on one timeline and a few concrete things are flagged — protein against body weight, a
 * week's intake against an estimated burn — but nothing here claims a causal link between a
 * given day's eating and a given muscle's readiness. This data cannot support that, and a
 * confident invented number would be worse than no number.
 */
export default function Fuel({ S, commitState }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO)
  const [paste, setPaste] = useState('')
  const [vals, setVals] = useState({})
  const [days, setDays] = useState(7)

  const log = S.nutrition || []
  const summary = useMemo(() => summarise(log, days), [log, days])

  const weightKg = S.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1].w : null
  const tdee = useMemo(() => estimateTdee(S.profile, weightKg), [S.profile, weightKg])
  const perKg = summary.protein != null && weightKg ? summary.protein / weightKg : null
  const verdict = proteinVerdict(perKg)

  // Sets per day over the same window, so intake and workload share one timeline.
  const setsByDay = useMemo(() => {
    const map = {}
    const cutoff = Date.now() - days * 86400000
    for (const w of S.workouts || []) {
      if ((w.start || new Date(w.d).getTime()) <= cutoff) continue
      const load = loadOfWorkouts([w])
      map[w.d] = Math.round(Object.values(load).reduce((a, b) => a + b, 0))
    }
    return map
  }, [S.workouts, days])

  function onPaste(text) {
    setPaste(text)
    const parsed = parseMacros(text)
    if (Object.values(parsed).some(v => v != null)) {
      setVals(v => ({
        ...v,
        ...Object.fromEntries(Object.entries(parsed).filter(([, x]) => x != null)),
      }))
    }
  }

  async function save() {
    const entry = { d: date }
    let any = false
    for (const m of MACROS) {
      const n = Number(vals[m.key])
      if (Number.isFinite(n) && n >= 0 && vals[m.key] !== '') { entry[m.key] = n; any = true }
    }
    if (!any) return
    const nutrition = [...log.filter(n => n.d !== date), entry].sort((a, b) => (a.d < b.d ? -1 : 1))
    await commitState({ ...S, nutrition })
    setVals({}); setPaste(''); setOpen(false)
  }

  async function remove(d) {
    if (!confirm(`Delete the entry for ${d}?`)) return
    await commitState({ ...S, nutrition: log.filter(n => n.d !== d) })
  }

  const implied = kcalFromMacros(vals)
  const typed = Number(vals.kcal)
  const mismatch = implied != null && Number.isFinite(typed) && typed > 0 && Math.abs(implied - typed) > Math.max(150, typed * 0.12)

  return (
    <>
      <section className="card">
        <div className="d-head">
          <h2 className="c-h">Log a day</h2>
          <button className="btn small primary" onClick={() => setOpen(o => !o)}>
            {open ? 'Cancel' : 'Add'}
          </button>
        </div>

        {open ? (
          <div className="form">
            <label className="field">
              <span>Date</span>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>

            <label className="field">
              <span>Paste from Claude</span>
              <textarea
                className="input area"
                rows={3}
                placeholder="e.g. Total: 2,150 kcal | Protein 148g | Carbs 210g | Fat 68g"
                value={paste}
                onChange={e => onPaste(e.target.value)}
              />
              <em className="foot" style={{ margin: '6px 0 0' }}>
                Numbers below fill in as you paste. Correct anything it reads wrong.
              </em>
            </label>

            <div className="field-grid">
              {MACROS.map(m => (
                <label key={m.key} className="field">
                  <span>{m.label} {m.unit && <em>{m.unit}</em>}</span>
                  <input
                    className="input" type="number" inputMode="decimal"
                    value={vals[m.key] ?? ''}
                    onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>

            {mismatch && (
              <div className="note busy">
                Those macros work out to about {Math.round(implied)} kcal, not {Math.round(typed)}.
                Worth a look — though rounding and fibre can account for a small gap.
              </div>
            )}

            <button className="btn primary" onClick={save}>Save day</button>
          </div>
        ) : (
          <>
            <div className="seg">
              {[7, 14, 30].map(d => (
                <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
                  {d}d
                </button>
              ))}
            </div>

            {summary.logged === 0 ? (
              <p className="p">
                Nothing logged in this window. Ask Claude what you ate, paste the totals in, and
                the averages build up from there.
              </p>
            ) : (
              <>
                <div className="stat-grid macros">
                  {MACROS.map(m => (
                    <div key={m.key} className="stat">
                      <span className="stat-l">{m.label}</span>
                      <span className="stat-v">
                        {summary[m.key] == null ? '—' : Math.round(summary[m.key])}
                        {summary[m.key] != null && m.unit ? <small>{m.unit}</small> : null}
                      </span>
                      <span className="stat-d flat">daily avg</span>
                    </div>
                  ))}
                </div>
                <p className="foot">
                  Averaged over the {summary.logged} day{summary.logged === 1 ? '' : 's'} you
                  actually logged, not over all {days} — otherwise a missed entry would read as a
                  day of eating nothing.
                </p>
              </>
            )}
          </>
        )}
      </section>

      {!open && summary.logged > 0 && (
        <section className="card">
          <h2 className="c-h">Reading</h2>
          <ul className="reads">
            {perKg != null && (
              <li className={verdict.state}>
                {/* Two decimals, not one: 1.573 rounds to "1.6" and then reads as
                    "1.6 g/kg — below 1.6 g/kg", which looks like a bug rather than a
                    near miss. */}
                <strong>{perKg.toFixed(2)} g/kg protein</strong> — {verdict.text}.
                {verdict.state === 'low' && weightKg * PROTEIN_LOW - summary.protein >= 5 &&
                  ` At ${weightKg} kg that is about ${Math.round(weightKg * PROTEIN_LOW)} g/day to reach the bottom of the range.`}
              </li>
            )}
            {tdee != null && summary.kcal != null && (
              <li className={Math.abs(summary.kcal - tdee) < tdee * 0.08 ? 'ok' : summary.kcal < tdee ? 'low' : 'high'}>
                <strong>{Math.round(summary.kcal)} kcal/day</strong> against an estimated{' '}
                {Math.round(tdee)} burn — {describeGap(summary.kcal, tdee)}.
              </li>
            )}
            {tdee == null && (
              <li className="flat">
                Fill in height, date of birth and activity under <strong>Body → Profile</strong>{' '}
                to compare intake against an estimated daily burn.
              </li>
            )}
            {perKg == null && (
              <li className="flat">
                Log a body weight under <strong>Body</strong> to see protein per kilogram, which
                is the number that actually matters.
              </li>
            )}
          </ul>
          <p className="foot">
            The burn figure is a Mifflin-St Jeor estimate scaled by the activity level you chose.
            It is a reference line, not a target — the equation has real spread between people,
            and the multiplier is a self-assessment.
          </p>
        </section>
      )}

      {!open && summary.days.length > 0 && (
        <section className="card">
          <h2 className="c-h">Day by day</h2>
          <ul className="rows">
            {[...summary.days].reverse().map(d => (
              <li key={d.d} className="row day-row" onClick={() => remove(d.d)}>
                <span className="r-name">
                  {new Date(d.d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="hist-cells">
                  {d.kcal != null ? <em>{Math.round(d.kcal)} kcal</em> : null}
                  {d.protein != null ? <em>{Math.round(d.protein)}p</em> : null}
                  {setsByDay[d.d] ? <em className="sets">{setsByDay[d.d]} sets</em> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="foot">
            Training volume is shown alongside so heavy days and intake can be read together.
            Tap a row to delete it.
          </p>
        </section>
      )}
    </>
  )
}

function describeGap(intake, burn) {
  const diff = intake - burn
  const pct = Math.abs(diff) / burn
  if (pct < 0.08) return 'roughly maintenance'
  const per = Math.abs(Math.round(diff))
  return diff < 0 ? `about ${per} kcal under` : `about ${per} kcal over`
}
