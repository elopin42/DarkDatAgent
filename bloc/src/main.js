import './style.css'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'
import Lenis from 'lenis'
import { focusIn, trancheIn, stackIn, reduced } from './motion.js'
import { initChain } from './chain.js'
import { drawThinPile } from './thinpile.js'

gsap.registerPlugin(ScrollTrigger, Flip)
window.__frontReady = false

const params = new URLSearchParams(location.search)
const freezeT = params.has('t') ? Number(params.get('t')) : null
const freezeS = params.has('s') ? Math.min(1, Math.max(0, Number(params.get('s')))) : null
const mobile = window.matchMedia('(max-width: 767px)').matches

// One clock: the GSAP ticker drives Lenis, ScrollTrigger and the three render.
let lenis = null
if (!reduced() && !mobile) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
}
gsap.ticker.lagSmoothing(0)
window.__front = { lenis }

function setupHeader() {
  const top = document.querySelector('.top')
  ScrollTrigger.create({ start: 80, end: 'max', onToggle: (s) => top.classList.toggle('is-solid', s.isActive) })
}

function setupReveals() {
  document.querySelectorAll('.reveal-title').forEach((el, i) => {
    if (el.closest('.s-hero')) focusIn(el, { now: true })
    else focusIn(el)
  })
  // panels slide out of their neighbour, one after the other in a group
  document.querySelectorAll('.tranche').forEach((el) => {
    const sib = [...el.parentElement.children].filter((c) => c.classList.contains('tranche'))
    trancheIn(el, { delay: sib.indexOf(el) * 0.12 })
  })
  stackIn('.rows .row', { trigger: '.rows', stagger: 0.32 })
  stackIn('.bench tbody tr', { trigger: '.bench table' })
  stackIn('.drift-list li', { trigger: '.drift-list', stagger: 0.12 })
  // the project row comes out of the table like a plate pulled from the stack
  if (!reduced()) {
    const ours = document.querySelector('.diff tr.ours')
    const tl = gsap.timeline({ paused: true })
    tl.fromTo(ours, { x: 0 }, { x: 48, duration: 0.44, ease: 'power2.out' })
      .to(ours, { x: 24, duration: 0.6, ease: 'power3.inOut' })
    ScrollTrigger.create({ trigger: '.diff', start: 'top 70%', once: true, onEnter: () => tl.play() })
    // the 2026 plate comes out from behind the 2021 one, 48 px to the right
    const pnew = document.querySelector('.pair-new')
    const tp = gsap.timeline({ paused: true })
    tp.fromTo(pnew, { x: -48, y: -24, clipPath: 'inset(0px 0px 0px 48px)' }, { x: 0, y: 0, clipPath: 'inset(0px 0px 0px 0px)', duration: 0.7, ease: 'power3.out', clearProps: 'clipPath' })
    ScrollTrigger.create({ trigger: '.pair', start: 'top 70%', once: true, onEnter: () => tp.play() })
    const pold = document.querySelector('.pair-old img')
    const to = gsap.timeline({ paused: true })
    to.fromTo(pold, { filter: 'blur(6px)', scale: 0.985 }, { filter: 'blur(0px)', scale: 1, duration: 0.48, ease: 'power2.out', clearProps: 'filter,scale' })
    ScrollTrigger.create({ trigger: '.pair', start: 'top 80%', once: true, onEnter: () => to.play() })
  }
}

async function start() {
  await document.fonts.ready
  setupHeader()
  setupReveals()
  drawThinPile(document.getElementById('thin-lines'))
  const chain = initChain({ freezeT })

  let scene = null
  if (!mobile) {
    try {
      const mod = await import('./scene.js')
      scene = await mod.initScene(document.getElementById('bloc'), { reduced: reduced() })
    } catch (e) {
      console.warn('WebGL scene unavailable, poster shown', e)
      document.documentElement.classList.add('no-webgl')
    }
  }
  if (scene) window.__front.renderer = scene.renderer

  ScrollTrigger.refresh()
  if (freezeS !== null) {
    const y = freezeS * (document.documentElement.scrollHeight - innerHeight)
    if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y)
    ScrollTrigger.update()
  }
  if (freezeT !== null) chain.seek(freezeT)
  scene?.render(true)
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__frontReady = true }))
}
start()
