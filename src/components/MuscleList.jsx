import { useState } from 'react'

/**
 * A muscle list that reads as six rows and opens to eighteen.
 *
 * The group row is not a header — it carries the group's own summary number, so the list is
 * useful without expanding anything. Opening a group is for when the summary raises a question
 * ("back is fatigued — which part?"), which is the only time the detail is worth the scroll.
 *
 * @param {Array} groups Output of groupValues().
 * @param {(v: number) => string} format Right-hand label for a value.
 * @param {(v: number) => string} [stateOf] Extra class for the bar and label, e.g. a fatigue band.
 * @param {number} [max] Value that fills the bar; defaults to the largest on screen.
 * @param {(slug: string) => void} [onSelect] Called when an individual muscle is tapped.
 */
export default function MuscleList({ groups, format, stateOf, max, onSelect, selected, emptyNote }) {
  const [open, setOpen] = useState(() => new Set())

  const toggle = id => setOpen(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const ceiling = max ?? Math.max(0, ...groups.map(g => g.value))
  const width = v => `${Math.max(2, ceiling > 0 ? (v / ceiling) * 100 : 0)}%`

  if (!groups.some(g => g.value > 0) && emptyNote) return <p className="foot">{emptyNote}</p>

  return (
    <ul className="rows grouped">
      {groups.map(g => {
        const isOpen = open.has(g.id)
        const single = g.muscles.length === 1
        return (
          <li key={g.id} className="group">
            <div
              className={'row group-row' + (isOpen ? ' open' : '')}
              onClick={() => (single ? onSelect?.(g.muscles[0].slug) : toggle(g.id))}
            >
              <span className="r-name">
                {!single && <span className={'caret' + (isOpen ? ' on' : '')} aria-hidden="true">›</span>}
                {g.name}
              </span>
              <span className="bar">
                <i className={'fill ' + (stateOf?.(g.value) || '')} style={{ width: width(g.value) }} />
              </span>
              <span className={'r-eta ' + (stateOf?.(g.value) || '')}>{format(g.value)}</span>
            </div>

            {isOpen && !single && (
              <ul className="rows sub">
                {g.muscles.map(m => (
                  <li
                    key={m.slug}
                    className={'row sub-row' + (selected === m.slug ? ' on' : '')}
                    onClick={() => onSelect?.(m.slug)}
                  >
                    <span className="r-name">{m.name}</span>
                    <span className="bar">
                      <i className={'fill ' + (stateOf?.(m.value) || '')} style={{ width: width(m.value) }} />
                    </span>
                    <span className={'r-eta ' + (stateOf?.(m.value) || '')}>{format(m.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
