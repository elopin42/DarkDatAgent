// Les intitulés de colonne copiés sur chaque cellule (revue en direct, point 29).
/** Les intitulés de colonne copiés sur chaque cellule, pour la lecture en fiches sous 600 px. */
export function labelTables() {
  document.querySelectorAll<HTMLTableElement>('table').forEach((t) => {
    const heads = Array.from(t.querySelectorAll('thead th')).map((h) => h.textContent?.trim() ?? '')
    t.querySelectorAll('tbody tr').forEach((tr) => Array.from(tr.children).forEach((c, i) => { if (c.tagName === 'TD' && !c.hasAttribute('data-label') && heads[i]) c.setAttribute('data-label', heads[i]) }))
  })
}

