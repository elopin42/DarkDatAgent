// « The same task, five years apart » (V2 point 26) : une frise chronologique pilotée au scroll, d'après le
// fonctionnement de la frise de netout.tech (pas sa DA). La section s'épingle un écran, la frise glisse sous une
// tête de lecture fixe, chaque étape franchie s'allume et la date sous la tête de lecture suit. Sous 900 px et en
// mouvement réduit : une liste verticale, tout allumé.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { fitQuad } from './flow'

const STEP = 380 // px entre deux étapes sur la frise

export function mountTimeline(reduced: boolean) {
  const tl = document.querySelector<HTMLElement>('[data-tl]')
  if (!tl) return
  const video = tl.querySelector<HTMLVideoElement>('[data-video]')
  if (video) {
    if (video.dataset.quad) fitQuad(video)
    if (!reduced) new IntersectionObserver(([e]) => { if (e.isIntersecting) video.play().catch(() => {}); else video.pause() }, { threshold: 0.3 }).observe(video)
  }
  const track = tl.querySelector<HTMLElement>('[data-tl-track]')!
  const fill = tl.querySelector<HTMLElement>('[data-tl-fill]')!
  const now = tl.querySelector<HTMLElement>('[data-tl-now]')!
  const evs = Array.from(tl.querySelectorAll<HTMLElement>('.tl__ev'))
  const wide = matchMedia('(min-width: 900px)').matches
  if (reduced || !wide) { tl.classList.add('tl--list'); evs.forEach((e) => e.classList.add('is-on')); now.textContent = evs.at(-1)!.dataset.when!; return }

  const xs = evs.map((e) => Number(e.dataset.x) * STEP)
  evs.forEach((e, i) => (e.style.left = `${xs[i]}px`))
  const last = xs[xs.length - 1]
  track.style.width = `${last}px`
  const viewport = tl.querySelector<HTMLElement>('.tl__viewport')!
  let shown = -1
  const apply = (p: number) => {
    const x = p * last
    gsap.set(track, { x: viewport.clientWidth / 2 - x })
    fill.style.transform = `scaleX(${p})`
    let k = 0
    evs.forEach((e, i) => { const on = xs[i] <= x + 1; e.classList.toggle('is-on', on); if (on) k = i })
    if (k !== shown) { shown = k; now.textContent = evs[k].dataset.when! }
  }
  apply(0)
  const o = { p: 0 }
  gsap.to(o, { p: 1, ease: 'none', onUpdate: () => apply(o.p),
    scrollTrigger: { trigger: tl, start: 'top 88px', end: '+=100%', pin: true, scrub: 0.6, invalidateOnRefresh: true } })
  addEventListener('resize', () => apply(o.p))
  ScrollTrigger.refresh()
}
