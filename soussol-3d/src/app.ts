// Le socle de chaque page de l'app : jetons et matière de la landing, gestes d'apparition du sous-sol
// (balayage cathodique des titres, boîte qui coulisse, rai qui passe), source des données. Pas de Lenis sur l'app.
import './style.css'
import './app.css'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { crtTitles, slideBoxes } from './reveals'
import { probeLive } from './source'

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

export async function boot(extra?: (live: Awaited<ReturnType<typeof probeLive>>) => void | Promise<void>) {
  await document.fonts.ready
  crtTitles(reduced)
  slideBoxes(reduced)
  const live = await probeLive()
  await extra?.(live)
  ScrollTrigger.refresh()
  ;(window as unknown as { __frontReady: boolean }).__frontReady = true
}

if (!(window as unknown as { __pageBoot?: boolean }).__pageBoot) {
  // page sans module propre : le socle démarre seul au prochain tour
  queueMicrotask(() => { if (!(window as unknown as { __pageBoot?: boolean }).__pageBoot) boot() })
}
