// The rail of plates (design/concepts.md 2.5 and 4.6), landing version: replay only.
// Nine plates stand on a rail. The current one leaves the rail and comes face on to the stand, shows what goes in and
// what comes out, then lands on the finished pile, which grows by one plate. Finished plates stay printed.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { reduced, spring, productive } from './motion.js'
import { FRAMES } from './data/frames.js'

const READ = FRAMES.filter((f) => f.read)
const lastBatch = READ.slice(-5)

export const LINKS = [
  { verb: 'Fetch', who: 'yt-dlp', inn: 'YouTube JZMgB1UItkk, “Tutoriel 17, Factures fournisseurs”, 5 February 2021, CC BY', out: 'the video file, 7:00', row: 'video, 7:00', tech: 'status.json, step download' },
  { verb: 'Listen', who: 'Gladia, solaria-3', key: true, inn: 'the French audio track', out: 'the voice as sentences, each with its start and end time', row: 'timestamped sentences', tech: 'one timestamp per sentence, language detected' },
  { verb: 'Cut', who: 'ffmpeg', inn: 'the video', out: '106 keyframes, 48 of them on a screen change', row: '106 keyframes', tech: 'scene threshold 0.08, frames at least 1 s apart, one every 5 s at most', thumbs: FRAMES.filter((f) => f.scene).slice(4, 9) },
  { verb: 'Pair', who: 'local script', inn: 'sentences and keyframes', out: 'storyboard.json, each sentence on the screen it was said over', row: 'storyboard.json', tech: '40_storyboard.py' },
  { verb: 'Read', who: 'H Models API, holo4-27b', key: true, inn: '60 keyframes and their sentences, 5 per request', out: 'steps with exact labels, fields, exception rules, what has probably changed', row: '60 frames, 13 requests', tech: '13 requests, about 8 min, falls back to holo3-1-35b-a3b if refused', thumbs: lastBatch, batch: 'batch 12 of 12, then one request to consolidate' },
  { verb: 'Register', who: 'H Agents API', key: true, inn: 'SKILL.old-voice.md', out: 'the skill pinned at revision 2, one agent with it and a control agent without', row: 'skill pinned, revision 2', tech: 'revision pinned in agent.json' },
  { verb: 'Run', who: 'clerk agent, H Agents API', key: true, inn: 'invoice 3, Transports Lemaire, in a real Chrome, at most 40 steps and 600 s', out: '35 steps, 200 s, a public replay', row: '35 steps, 200 s', tech: 'progress followed by long-poll on H changes', count: 35 },
  { verb: 'Verify', who: '80_verify.py, SQL', inn: 'the table llx_facture_fourn, before and after', out: 'success: the invoice exists, on the Transports Lemaire that has a SIREN', row: 'success', tech: 'agent says against database says, row count before and after' },
  { verb: 'Repair', who: '75_repair.py', inn: 'the drift notes left by the runs', out: 'revision 1 of the skill became revision 2', row: 'revision 1 to 2', tech: 'repairs.json' },
]

const T_IN = 0.52, T_DWELL = 1.7, T_OUT = 0.52
const STEP = T_IN + T_DWELL + T_OUT + 0.06

export function initChain({ freezeT } = {}) {
  const rail = document.getElementById('rail')
  const stand = document.getElementById('stand')
  const pile = document.getElementById('donepile')
  const btnPlay = document.getElementById('chain-play')
  const btnPrev = document.getElementById('chain-prev')
  const btnNext = document.getElementById('chain-next')
  const meta = document.getElementById('chain-meta')

  const links = LINKS.map((l, i) => {
    const el = document.createElement('div')
    el.className = 'link' + (l.key ? ' is-key' : '')
    el.setAttribute('role', 'listitem')
    el.innerHTML = `<div class="face"><p class="n">${String(i + 1).padStart(2, '0')}</p><div><p class="verb">${l.verb}</p><p class="who">${l.who}</p></div></div>`
    rail.appendChild(el)
    return el
  })
  const empty = document.createElement('div')
  empty.className = 'stand-empty'
  empty.innerHTML = '<p class="mono">Press replay, or scroll here, to watch the run</p>'
  stand.appendChild(empty)

  let cursor = 0          // next link to play
  let tl = null
  let busy = false
  let playing = false
  let card = null

  function cardHTML(l, i) {
    const thumbs = l.thumbs ? `<div class="thumbs">${l.thumbs.map((f) => `<img src="/frames/${f.file.replace('.jpg', '.webp')}" alt="Keyframe at ${fmt(f.t)}" width="48" height="30">`).join('')}</div>` : ''
    const count = l.count ? `<span class="count">0</span> of ${l.count} steps` : ''
    return `<p class="n">${String(i + 1).padStart(2, '0')} of 09</p>
      <div><h3 class="title-m">${l.verb}</h3><p class="who">${l.who}</p></div>
      <div class="io"><div><h4>In</h4><p>${l.inn}</p>${thumbs}</div><div class="out"><h4>Out</h4><p>${l.out}</p>${l.batch ? `<p class="batch">${l.batch}</p>` : ''}${count ? `<p>${count}</p>` : ''}</div></div>
      <p class="tech">${l.tech}</p>`
  }
  function rowHTML(l, i) {
    return `<p class="r1"><span>${String(i + 1).padStart(2, '0')} ${l.verb}</span><span>done</span></p><p class="r2">${l.row}</p>`
  }
  function makeRow(i) {
    const r = document.createElement('div')
    r.className = 'done-row'
    r.innerHTML = rowHTML(LINKS[i], i)
    pile.appendChild(r)
    return r
  }
  function makeCard(i) {
    const c = document.createElement('div')
    c.className = 'stand-card is-reading'
    c.innerHTML = cardHTML(LINKS[i], i)
    stand.appendChild(c)
    return c
  }

  // direct state, for ?t=, reduced motion and stepping back: links 0..k-1 done, link k on the stand
  function setState(k, onStand = true) {
    tl?.kill(); tl = null; busy = false
    pile.innerHTML = ''
    stand.querySelectorAll('.stand-card').forEach((c) => c.remove())
    card = null
    links.forEach((el, j) => el.classList.toggle('is-out', j < k || (onStand && j === k)))
    for (let j = 0; j < k; j++) makeRow(j)
    empty.style.visibility = k > 0 || onStand ? 'hidden' : 'visible'
    if (onStand && k < LINKS.length) {
      card = makeCard(k)
      card.classList.remove('is-reading'); card.classList.add('is-done')
      const c = card.querySelector('.count'); if (c) c.textContent = LINKS[k].count
    }
    cursor = onStand ? k + 1 : k
  }

  // one animated step: link i leaves the rail, comes to the stand, prints its output, lands on the pile
  function playStep(i) {
    if (i >= LINKS.length) return null
    busy = true
    const link = links[i]
    const face = link.querySelector('.face')
    const prev = card
    const t = gsap.timeline({ onComplete: () => { busy = false } })
    // previous card (if any) goes to the pile first
    if (prev) {
      const row = makeRow(i - 1)
      row.style.visibility = 'hidden'
      const rr = row.getBoundingClientRect(), cr = prev.getBoundingClientRect()
      t.to(prev, { x: rr.left - cr.left, y: rr.top - cr.top, scaleX: rr.width / cr.width, scaleY: rr.height / cr.height, transformOrigin: '0 0', duration: T_OUT, ease: productive })
      t.add(() => { prev.remove(); row.style.visibility = 'visible' })
      t.fromTo(row, { y: -10 }, { y: 0, duration: 0.52, ease: spring })
    }
    t.add(() => {
      empty.style.visibility = 'hidden'
      card = makeCard(i)
      const fr = face.getBoundingClientRect(), cr = card.getBoundingClientRect()
      link.classList.add('is-out')
      gsap.fromTo(card, { x: fr.left - cr.left, y: fr.top - cr.top, scaleX: fr.width / cr.width, scaleY: fr.height / cr.height, rotationY: -18, transformOrigin: '0 0', transformPerspective: 1600 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationY: 0, duration: T_IN, ease: spring })
      const l = LINKS[i]
      const io = card.querySelectorAll('.io > div')
      gsap.fromTo(io, { y: -12 }, { y: 0, duration: 0.52, ease: spring, stagger: 0.12, delay: T_IN * 0.6 })
      const th = card.querySelectorAll('.thumbs img')
      if (th.length) gsap.fromTo(th, { x: -60, scale: 1.1 }, { x: 0, scale: 1, duration: 0.6, ease: productive, stagger: 0.1, delay: T_IN })
      const c = card.querySelector('.count')
      if (c) { const o = { v: 0 }; gsap.to(o, { v: l.count, duration: T_DWELL, ease: 'none', delay: T_IN, onUpdate: () => { c.textContent = Math.round(o.v) } }) }
      gsap.delayedCall(T_IN + T_DWELL * 0.8, () => { card?.classList.remove('is-reading'); card?.classList.add('is-done') })
    })
    t.to({}, { duration: T_IN + T_DWELL })
    cursor = i + 1
    return t
  }

  function finish() {
    // last card lands on the pile too
    if (!card) return
    const prev = card
    const row = makeRow(LINKS.length - 1)
    row.style.visibility = 'hidden'
    const rr = row.getBoundingClientRect(), cr = prev.getBoundingClientRect()
    const t = gsap.timeline()
    t.to(prev, { x: rr.left - cr.left, y: rr.top - cr.top, scaleX: rr.width / cr.width, scaleY: rr.height / cr.height, transformOrigin: '0 0', duration: T_OUT, ease: productive })
    t.add(() => { prev.remove(); card = null; row.style.visibility = 'visible'; empty.style.visibility = 'visible'; empty.innerHTML = '<p class="mono">Nine plates on the pile. The run is checked in the database.</p>' })
    t.fromTo(row, { y: -10 }, { y: 0, duration: 0.52, ease: spring })
    cursor = LINKS.length + 1
    return t
  }

  function playAll() {
    if (reduced()) { setState(LINKS.length - 1); return }
    setState(0, false)
    playing = true
    btnPlay.textContent = 'Pause'
    const master = gsap.timeline({ onComplete: () => { playing = false; btnPlay.textContent = 'Replay the run' } })
    for (let i = 0; i <= LINKS.length; i++) {
      master.add(() => {
        if (i < LINKS.length) playStep(i)
        else finish()
      }, i * STEP)
    }
    master.to({}, { duration: 0.6 })
    tl = master
  }

  function step(dir) {
    if (busy) return
    if (playing) { tl?.pause(); playing = false; btnPlay.textContent = 'Replay the run' }
    if (dir > 0) {
      if (cursor < LINKS.length) playStep(cursor)
      else if (cursor === LINKS.length) finish()
    } else {
      const k = Math.max(0, cursor - 2)
      setState(k)
    }
  }

  btnPlay.addEventListener('click', () => {
    if (playing) { tl?.pause(); playing = false; btnPlay.textContent = 'Resume'; return }
    if (tl && tl.progress() < 1 && btnPlay.textContent === 'Resume') { tl.resume(); playing = true; btnPlay.textContent = 'Pause'; return }
    playAll()
  })
  btnNext.addEventListener('click', () => step(1))
  btnPrev.addEventListener('click', () => step(-1))

  const section = document.getElementById('chain')
  let inView = false
  ScrollTrigger.create({ trigger: section, start: 'top 80%', end: 'bottom 20%', onToggle: (s) => { inView = s.isActive } })
  window.addEventListener('keydown', (e) => {
    if (!inView || e.target.closest?.('input,textarea')) return
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    else if (e.key === ' ' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); btnPlay.click() }
    else if (e.key === 'r' || e.key === 'R') playAll()
  })

  if (freezeT === null) {
    if (reduced()) setState(LINKS.length - 1)
    else ScrollTrigger.create({ trigger: section, start: 'top 45%', once: true, onEnter: () => { if (!tl) playAll() } })
  }

  return {
    seek(ms) {
      const k = Math.min(LINKS.length - 1, Math.floor(ms / 1000 / STEP))
      setState(k)
      meta.dataset.frozen = String(ms)
    },
  }
}

function fmt(t) {
  const m = Math.floor(t / 60), s = Math.round(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
