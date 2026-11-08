// L'entrée de l'app locale (/start/). Le témoin de chaque lien [data-local-link] dit si l'app Django répond sur cette
// machine (/api/state.json sans le drapeau « replay » du relevé statique). L'écran de la section « Run it on your own
// video » écrit ses lignes une à une quand il entre ; sans JS ou en mouvement réduit, tout est déjà affiché.
export async function markLocalLinks(reduced: boolean) {
  const screen = document.querySelector<HTMLElement>('[data-try-screen]')
  if (screen && !reduced && 'IntersectionObserver' in window) {
    screen.classList.add('is-armed')
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      screen.classList.add('is-on')
      io.disconnect()
    }, { threshold: 0.35 })
    io.observe(screen)
  }
  const links = Array.from(document.querySelectorAll<HTMLElement>('[data-local-link]'))
  if (!links.length) return
  let on = false
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 1500)
    const r = await fetch('/api/state.json', { signal: ctl.signal, headers: { accept: 'application/json' } })
    clearTimeout(to)
    on = r.ok && (r.headers.get('content-type') || '').includes('json') && !((await r.json()) as { replay?: boolean }).replay
  } catch {
    on = false
  }
  for (const a of links) {
    a.dataset.local = on ? 'on' : 'off'
    a.title = on ? 'The local app answers on this machine' : 'Not running here: start it with make, then open this link'
  }
  document.querySelectorAll<HTMLElement>('[data-local-off]').forEach((n) => (n.hidden = on))
}
