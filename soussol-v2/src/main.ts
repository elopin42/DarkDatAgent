import './style.css'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import Lenis from 'lenis'
import { SITE_NAME } from './config'
import { buildSleepers, crtTitles, slideBoxes, raySweeps, counters, usRow } from './reveals'
import { mountChain } from './chain'
import { probeLive } from './source'
import './app.css'
import './v2.css'
import { mountGround } from './ground'
import { v2Reveals } from './v2reveal'
import { markLocalLinks } from './locallink'
import { mountTimeline } from './timeline'
import { labelTables } from './tables'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase)
CustomEase.create('friction', '0.3, 0, 0.1, 1')

const params = new URLSearchParams(location.search)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const mobile = window.matchMedia('(max-width: 767px)').matches
const frozenT = params.has('t') ? Number(params.get('t')) : null
const frozenS = params.has('s') ? Math.min(1, Math.max(0, Number(params.get('s')))) : null

void SITE_NAME // le nom est écrit dans le HTML avec ses capitales D, D, A en ambre

// Une seule horloge : le ticker GSAP pilote Lenis, ScrollTrigger et le rendu three.
let lenis: Lenis | null = null
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, syncTouch: false })
  lenis.on('scroll', ScrollTrigger.update)
}
const frameHooks: Array<(t: number) => void> = []
gsap.ticker.add((time) => {
  lenis?.raf(time * 1000)
  for (const f of frameHooks) f(time)
})
gsap.ticker.lagSmoothing(0)

// En-tête : clair dès qu'on a traversé le verre.
const nav = document.querySelector<HTMLElement>('[data-nav]')!
ScrollTrigger.create({
  trigger: '#problem', start: 'top 64px', end: 'max',
  onToggle: (st) => nav.classList.toggle('is-light', st.isActive),
})
void markLocalLinks(reduced) // le témoin du lien vers l'app locale s'allume dès que Django répond, avant la scène

async function boot() {
  await document.fonts.ready
  await Promise.all([document.fonts.load('600 64px "Hanken Grotesk"'), document.fonts.load('16px PC6300'), document.fonts.load('14px "Chivo Mono"')]).catch(() => {})

  buildSleepers(reduced)
  const chain = mountChain({ reduced, frozen: frozenT !== null })

  // La scène se charge à part : la page est lisible sans elle.
  let sceneReady: Promise<void> = Promise.resolve()
  const canvas = document.querySelector<HTMLCanvasElement>('[data-scene]')!
  const gl = (() => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } })()
  if (!gl || params.has('nowebgl')) {
    document.documentElement.classList.add('no-webgl')
    const img = document.querySelector<HTMLImageElement>('[data-poster]')!
    img.src = img.dataset.src!
  } else {
    sceneReady = import('./hero').then(async ({ mountHero }) => {
      const hero = await mountHero(canvas, { reduced, mobile, frozenT })
      frameHooks.push(hero.frame)
      // point 23 : la salle s'allume sur son affiche, comme une lampe qui chauffe (1,2 s), jamais d'un coup
      gsap.fromTo(canvas, { opacity: 0, scale: 1.015 }, { opacity: 1, scale: 1, duration: reduced ? 0 : 1.2, ease: 'power2.inOut', clearProps: 'transform' }) // la salle s'avance d'un rien en s'allumant : opacité et échelle, composées par le GPU
    }).catch((e) => {
      console.warn('scene', e)
      document.documentElement.classList.add('no-webgl')
      const img = document.querySelector<HTMLImageElement>('[data-poster]')!
      img.src = img.dataset.src!
    })
  }
  await sceneReady

  crtTitles(reduced)
  slideBoxes(reduced)
  raySweeps(reduced)
  counters(reduced)
  usRow(reduced)
  v2Reveals(reduced)
  mountTimeline(reduced)
  labelTables()
  // le fond n'est visible qu'après le hero : sa toile et son shader attendent que la page soit au repos
  const idle = (f: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (cb: () => void, o: object) => void }).requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 1500))
  if (!params.has('noground')) idle(() => mountGround({ reduced, heroGate: () => scrollY < innerHeight * 0.9 }))
  chain.arm()
  probeLive()

  ScrollTrigger.refresh()
  if (frozenS !== null) {
    const y = frozenS * (document.documentElement.scrollHeight - innerHeight)
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
    else window.scrollTo(0, y)
    ScrollTrigger.update()
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ;(window as unknown as { __frontReady: boolean }).__frontReady = true
  }))
}
boot()
