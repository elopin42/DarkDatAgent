// Une seule horloge : le ticker GSAP pilote Lenis, ScrollTrigger et le rendu three (R3F en frameloop="never").
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)

export const params = new URLSearchParams(location.search)
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
export const mobile = matchMedia('(max-width: 767px)').matches
/** ?t=ms fige le temps du rejeu, ?s=0..1 fige la position de scroll */
export const frozenT = params.has('t') ? Number(params.get('t')) : null
export const frozenS = params.has('s') ? Number(params.get('s')) : null

type Sub = (time: number, dt: number) => void
const subs = new Set<Sub>()
export function onTick(fn: Sub) { subs.add(fn); return () => { subs.delete(fn) } }

export let lenis: Lenis | null = null

export function startClock() {
  if (!reduced && !mobile && frozenS === null) {
    lenis = new Lenis({ lerp: 0.08, autoRaf: false })
    lenis.on('scroll', ScrollTrigger.update)
  }
  gsap.ticker.lagSmoothing(0)
  let last = 0
  gsap.ticker.add((time) => {
    const dt = last ? time - last : 1 / 60
    last = time
    lenis?.raf(time * 1000)
    subs.forEach((fn) => fn(time, dt))
  })
}

export function scrollToFraction(f: number) {
  const max = document.documentElement.scrollHeight - innerHeight
  const y = Math.round(max * Math.min(1, Math.max(0, f)))
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
  else window.scrollTo(0, y)
  ScrollTrigger.update()
}

export { gsap, ScrollTrigger }
