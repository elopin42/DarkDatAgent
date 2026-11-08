// La source des données de chaque page. Par défaut : le relevé du 7 novembre (report/ et work/, embarqué).
// Si l'app locale Django répond sur la même origine (/api/state.json), la page passe en direct.
// États : chargement (« Connecting »), en direct, app locale absente (repli sur le relevé), vide (aucun run).
export type LiveState = { runs?: Array<Record<string, unknown>>; status?: Record<string, unknown>; updated_at?: string }
type State = 'loading' | 'live' | 'offline' | 'empty'

const chips = () => Array.from(document.querySelectorAll<HTMLElement>('[data-source]'))
const REPLAY = 'Replay of 7 November 2026, read from report and work'

export function setSource(state: State, detail = '') {
  for (const c of chips()) {
    c.dataset.state = state
    const t = c
    if (state === 'loading') t.innerHTML = `${REPLAY}. Looking for the local app`
    else if (state === 'live') t.innerHTML = `Live from the local app${detail ? `, ${detail}` : ''}`
    else if (state === 'empty') t.innerHTML = `The local app answers but has no run yet. ${REPLAY}`
    else t.innerHTML = `${REPLAY}. The local app is not running here, start it with make run to go live`
  }
}

/** Interroge l'app locale une fois, en 1,5 s au plus. Ne jette jamais : renvoie null hors ligne. */
export async function probeLive(): Promise<LiveState | null> {
  if (!chips().length) return null
  setSource('loading')
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 1500)
    const r = await fetch('/api/state.json', { signal: ctl.signal, headers: { accept: 'application/json' } })
    clearTimeout(to)
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error(String(r.status))
    const data = (await r.json()) as LiveState & { replay?: boolean }
    if (data.replay) { setSource('offline'); return null } // le relevé statique : pas d'app locale derrière
    if (!data.runs || !data.runs.length) { setSource('empty'); return data }
    setSource('live', data.updated_at ? `updated ${data.updated_at}` : '')
    document.documentElement.classList.add('is-live')
    return data
  } catch {
    setSource('offline')
    return null
  }
}
