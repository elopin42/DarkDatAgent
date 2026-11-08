import { boot, rayOnEnter } from './app'
;(window as unknown as { __pageBoot: boolean }).__pageBoot = true
boot(() => {
  const list = document.querySelector<HTMLElement>('[data-shots]')!
  const tabs = document.querySelectorAll<HTMLButtonElement>('[data-mode]')
  const set = (m: string) => {
    list.classList.toggle('is-images', m === 'images')
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.mode === m)))
    const u = new URL(location.href); u.searchParams.set('mode', m); history.replaceState(null, '', u)
  }
  tabs.forEach((t) => t.addEventListener('click', () => set(t.dataset.mode!)))
  if (new URLSearchParams(location.search).get('mode') === 'images') set('images')
  rayOnEnter('.shot__img.ray')
})
