import { boot } from './app'
;(window as unknown as { __pageBoot: boolean }).__pageBoot = true
boot(() => {
  const rows = document.querySelectorAll<HTMLTableRowElement>('[data-runs] tbody tr')
  const tabs = document.querySelectorAll<HTMLButtonElement>('[data-arm]')
  const set = (a: string) => {
    rows.forEach((r) => (r.hidden = a !== 'all' && r.dataset.arm !== a))
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.arm === a)))
    const u = new URL(location.href); if (a === 'all') u.searchParams.delete('arm'); else u.searchParams.set('arm', a); history.replaceState(null, '', u)
  }
  tabs.forEach((t) => t.addEventListener('click', () => set(t.dataset.arm!)))
  const q = new URLSearchParams(location.search).get('arm'); if (q) set(q)
})
