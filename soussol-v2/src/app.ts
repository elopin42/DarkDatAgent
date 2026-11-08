// Le socle de chaque page de l'app : jetons et matière de la landing, gestes d'apparition du sous-sol
// (balayage cathodique des titres, boîte qui coulisse, rai qui passe), source des données. Pas de Lenis sur l'app.
import './style.css'
import './app.css'
import './v2.css'
import { mountGround } from './ground'
import { v2Reveals } from './v2reveal'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { crtTitles, slideBoxes } from './reveals'
import { probeLive } from './source'
import { markLocalLinks } from './locallink'
import { labelTables } from './tables'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase)
CustomEase.create('friction', '0.3, 0, 0.1, 1')
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Le rai qui passe sur une image quand elle entre, une fois. */
export function rayOnEnter(sel: string) {
  if (reduced) return
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: 'top 80%', once: true,
      onEnter: () => gsap.fromTo(el, { '--sweep': 0, '--ray-o': 1 }, { '--sweep': 1.2, duration: 0.9, ease: 'power1.inOut', onComplete: () => gsap.set(el, { '--ray-o': 0 }) }),
    })
  })
}

/** L'étagère des rayonnages statiques, calée sur le bas des boîtes rendues. */
function shelves() {
  document.querySelectorAll<HTMLElement>('.rack--static').forEach((r) => {
    const b = r.querySelector<HTMLElement>('.box'), img = b?.querySelector<HTMLElement>('.box__img')
    if (b && img) r.style.setProperty('--shelf-y', `${b.offsetTop + img.offsetTop + img.offsetHeight - 6}px`)
  })
}

export async function boot(extra?: (live: Awaited<ReturnType<typeof probeLive>>) => void | Promise<void>) {
  await document.fonts.ready
  crtTitles(reduced)
  slideBoxes(reduced)
  const q = new URLSearchParams(location.search) // diagnostic : ?noground, ?noreveal
  if (!q.has('noreveal')) v2Reveals(reduced)
  if (!q.has('noground')) mountGround({ reduced })
  shelves(); addEventListener('resize', shelves)
  void markLocalLinks(reduced)
  labelTables()
  const live = await probeLive()
  await extra?.(live)
  ScrollTrigger.refresh()
  ;(window as unknown as { __frontReady: boolean }).__frontReady = true
}

if (!(window as unknown as { __pageBoot?: boolean }).__pageBoot) {
  // page sans module propre : le socle démarre seul au prochain tour
  queueMicrotask(() => { if (!(window as unknown as { __pageBoot?: boolean }).__pageBoot) boot() })
}
