// Les boîtes à archives rendues sous Blender (V2 points 5 et 7) : quatre états au même cadrage et deux séquences
// (l'ouverture qui allume le petit écran, la fin qui sort la feuille), pilotées en bande d'images par GSAP.
import { gsap } from 'gsap'

export type BoxState = 'waiting' | 'reading' | 'done' | 'failed' | 'skipped' | 'unknown'
const R = '/renders/box/'
const dpr2 = () => devicePixelRatio > 1.25
const strip = (name: 'open' | 'done') => `${R}box-${name}-strip${dpr2() ? '@2x' : ''}.webp`
const FRAMES = { open: 24, done: 16 }

/** Précharge les deux bandes pour que la première ouverture ne saute pas. */
export function preloadStrips() { for (const n of ['open', 'done'] as const) { const i = new Image(); i.src = strip(n) } }

/** Le balisage d'une boîte (le même partout : board, chaîne de la landing, rayonnages statiques). */
export function boxInner(i: number, verb: string, tool: string, state = 'waiting', sheet = '') {
  return `<span class="box__img" aria-hidden="true"><span class="box__num"><span class="box__n">${String(i + 1).padStart(2, '0')}</span>${verb}</span><span class="box__sheet">${sheet}</span><span class="box__meter"></span></span><span class="box__label"><span class="box__verb">${verb}</span><span class="box__tool">${tool}</span></span><span class="box__state">${state}</span>`
}

/** Joue une séquence sur l'image de la boîte, puis laisse la classe d'état prendre la main. */
export function playStrip(li: HTMLElement, name: 'open' | 'done', seconds: number, onDone?: () => void) {
  const img = li.querySelector<HTMLElement>('.box__img')!
  const n = FRAMES[name]
  img.style.backgroundImage = `url(${strip(name)})`
  img.style.backgroundSize = `${n * 100}% 100%`
  const o = { k: 0 }
  gsap.to(o, { k: n - 1, duration: seconds, ease: 'none', onUpdate: () => { img.style.backgroundPosition = `${(Math.round(o.k) / (n - 1)) * 100}% 0` }, onComplete: () => { img.style.backgroundImage = ''; img.style.backgroundSize = ''; img.style.backgroundPosition = ''; onDone?.() } })
}
