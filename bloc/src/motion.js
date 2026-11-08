// The three appearance gestures of direction B (design/concepts.md 4.4, 4.8):
// focus (titles and images), tranche (panels slide out from behind their neighbour), stack (rows drop onto their place).
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const EASE = 'productive'

// Damped spring, stiffness 170, damping 26, mass 1, normalised so it ends at 1 (overshoot under 3 %).
export function springEase(k = 170, c = 26, dur = 0.52) {
  const w0 = Math.sqrt(k)
  const z = c / (2 * w0)
  const wd = w0 * Math.sqrt(Math.max(1e-4, 1 - z * z))
  return (p) => {
    if (p >= 1) return 1
    const t = p * dur
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))
  }
}
export const spring = springEase()

// cubic-bezier(0.25, 1, 0.5, 1) as a GSAP ease
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    let t = x
    for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (sx(t) - x) / d }
    return sy(Math.min(1, Math.max(0, t)))
  }
}
export const productive = bezier(0.25, 1, 0.5, 1)

// Split a heading into words (kept readable: the text stays in the DOM, each word in a span).
function splitWords(el) {
  if (el.dataset.split) return el.querySelectorAll('.w')
  const words = el.textContent.trim().split(/\s+/)
  el.textContent = ''
  words.forEach((w, i) => {
    const s = document.createElement('span')
    s.className = 'w'
    s.textContent = w
    el.appendChild(s)
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
  el.dataset.split = '1'
  return el.querySelectorAll('.w')
}

// 1. focus: 6 px blur to sharp, scale 0.985 to 1, 480 ms, words 40 ms apart, at top 85 %
export function focusIn(el, opts = {}) {
  const words = splitWords(el)
  if (reduced()) return null
  const tl = gsap.timeline({ paused: true })
  tl.fromTo(words, { filter: 'blur(6px)', scale: 0.985, opacity: 0.25 },
    { filter: 'blur(0px)', scale: 1, opacity: 1, duration: 0.48, ease: productive, stagger: 0.04, clearProps: 'filter,scale,opacity' })
  if (opts.now) { tl.play(); return tl }
  ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => tl.play() })
  return tl
}

// 2. tranche: the panel slides 48 px out from behind its left neighbour; the hidden strip stays aligned with that
// edge (clip), its shadow lengthens during the move then settles (440 ms).
export function trancheIn(el, opts = {}) {
  if (reduced()) return null
  const tl = gsap.timeline({ paused: true })
  tl.fromTo(el, { x: -48, clipPath: 'inset(0px 0px 0px 48px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 0px 0px rgba(17,22,31,0.0)' },
    { x: 0, clipPath: 'inset(0px 0px 0px 0px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 12px 24px rgba(17,22,31,0.16)', duration: 0.44, ease: productive })
    .to(el, { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 2px 2px rgba(17,22,31,0.16)', duration: 0.3, ease: 'power1.out', clearProps: 'boxShadow,clipPath' })
  if (opts.now) { tl.play(); return tl }
  ScrollTrigger.create({ trigger: el, start: opts.start || 'top 85%', once: true, onEnter: () => tl.delay(opts.delay || 0).play() })
  return tl
}

// 3. stack: the items drop onto their place one after the other (spring, 520 ms)
export function stackIn(items, opts = {}) {
  if (reduced()) return null
  const list = gsap.utils.toArray(items)
  const tl = gsap.timeline({ paused: true })
  tl.fromTo(list, { y: -28, scale: 1.015, boxShadow: '0 14px 22px rgba(17,22,31,0.18)' },
    { y: 0, scale: 1, boxShadow: '0 2px 2px rgba(17,22,31,0.16)', duration: 0.52, ease: spring, stagger: opts.stagger ?? 0.16, clearProps: 'boxShadow,scale' })
  if (opts.now) { tl.play(); return tl }
  ScrollTrigger.create({ trigger: opts.trigger || list[0], start: 'top 85%', once: true, onEnter: () => tl.play() })
  return tl
}
