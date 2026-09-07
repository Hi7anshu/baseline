import { useMemo, useState } from 'react'
import { searchCatalogue, overrideKey, reresolveCustoms } from '../lib/match.js'
import { MUSCLES, MUSCLE_NAME, musclesOf } from '../vendor/lib/muscles.js'
import { EXIDX } from '../vendor/lib/exercises.js'

/**
 * Teach the app the exercises it could not place.
 *
 * openGym's catalogue is fixed and Hevy keeps adding movements, so a permanent gap between the
 * two is guaranteed — which makes "wait for someone to add an alias" the wrong answer. Anything
 * assigned here is remembered by name, applied to every future import, and back-applied to the
 * training already on file.
 *
 * Two ways to answer, because they fail differently: pointing at a catalogue exercise inherits
 * its full primary/secondary weighting and is preferred, while naming muscles directly is the
 * escape hatch for movements the catalogue simply does not contain (a rowing erg, say).
 */
export default function Unidentified({ S, commitState }) {
  const pending = (S.customEx || []).filter(c => !c.muscleWeights)
  const assigned = (S.customEx || []).filter(c => c.muscleWeights)

  if (!pending.length && !assigned.length) return null

  return (
    <section className="card">
      <h2 className="c-h">Unidentified exercises</h2>
      <p className="p">
        These are in your Hevy log but not in the exercise catalogue, so they are currently
        counted in <strong>nothing</strong>. Tell the app what each one is and it will be applied
        to your existing history straight away.
      </p>
      {pending.map(c => (
        <Row key={c.id} custom={c} S={S} commitState={commitState} />
      ))}
      {assigned.map(c => (
        <Row key={c.id} custom={c} S={S} commitState={commitState} done />
      ))}
    </section>
  )
}

function Row({ custom, S, commitState, done }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('exercise')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState([])

  const results = useMemo(() => (query.trim() ? searchCatalogue(query) : []), [query])

  async function save(override) {
    const overrides = { ...(S.overrides || {}), [overrideKey(custom.n)]: override }
    await commitState(reresolveCustoms({ ...S, overrides }))
    setOpen(false)
    setQuery('')
    setPicked([])
  }

  async function clear() {
    const overrides = { ...(S.overrides || {}) }
    delete overrides[overrideKey(custom.n)]
    await commitState(reresolveCustoms({ ...S, overrides }))
  }

  const current = done
    ? Object.keys(custom.muscleWeights || {}).map(s => MUSCLE_NAME[s]).join(', ')
    : null

  return (
    <div className={'unid' + (done ? ' done' : '')}>
      <div className="unid-head">
        <div className="unid-name">
          <strong>{custom.n}</strong>
          {current && <span className="unid-sub">counted as {current}</span>}
        </div>
        {done
          ? <button className="btn small" onClick={clear}>Undo</button>
          : <button className="btn small primary" onClick={() => setOpen(o => !o)}>
              {open ? 'Cancel' : 'Identify'}
            </button>}
      </div>

      {open && (
        <div className="unid-body">
          <div className="seg">
            <button className={'seg-b' + (mode === 'exercise' ? ' on' : '')} onClick={() => setMode('exercise')}>
              Match an exercise
            </button>
            <button className={'seg-b' + (mode === 'muscles' ? ' on' : '')} onClick={() => setMode('muscles')}>
              Pick muscles
            </button>
          </div>

          {mode === 'exercise' ? (
            <>
              <input
                className="input"
                placeholder="Search — e.g. lateral raise"
                value={query}
                autoFocus
                onChange={e => setQuery(e.target.value)}
              />
              <ul className="picks">
                {results.map(ex => (
                  <li key={ex.id}>
                    <button className="pick" onClick={() => save({ ex: ex.id })}>
                      <span className="pick-n">{ex.n}</span>
                      <span className="pick-m">
                        {Object.entries(musclesOf(ex)).sort((a, b) => b[1] - a[1])
                          .map(([s]) => MUSCLE_NAME[s]).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
                {query.trim() && !results.length && (
                  <li className="foot">
                    Nothing matches. Try fewer words, or use <strong>Pick muscles</strong> instead.
                  </li>
                )}
              </ul>
            </>
          ) : (
            <>
              <p className="foot">
                First one chosen is the primary muscle; the rest count as supporting, the same
                way the catalogue weights its own secondaries.
              </p>
              <div className="chips pickable">
                {MUSCLES.map(slug => {
                  const i = picked.indexOf(slug)
                  return (
                    <button
                      key={slug}
                      className={'chip' + (i === 0 ? ' primary' : i > 0 ? ' secondary' : '')}
                      onClick={() => setPicked(p => (p.includes(slug) ? p.filter(x => x !== slug) : [...p, slug]))}
                    >
                      {MUSCLE_NAME[slug]}{i === 0 ? ' · primary' : ''}
                    </button>
                  )
                })}
              </div>
              <button className="btn primary" disabled={!picked.length} onClick={() => save({ muscles: picked })}>
                {picked.length ? `Count as ${picked.map(s => MUSCLE_NAME[s]).join(', ')}` : 'Pick at least one muscle'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Suggest what an already-identified name resolved to, for the Data tab summary. */
export const resolvedLabel = id => EXIDX[id]?.n || null
