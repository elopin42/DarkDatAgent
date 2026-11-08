// Le schéma de la chaîne en rayonnage (concepts.md 2.5 et 3.6) : neuf boîtes à archives vues de dos. La boîte en
// cours coulisse de 34 px, son étiquette passe à l'ambre et le panneau de lecture montre ce qui entre et ce qui sort.
// Terminée, elle rentre, une feuille dépasse de son couvercle avec la sortie réelle, la liaison suivante se dessine.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import data from './data/tutorial.json'
import { REPLAY_RUN } from './config'
import { boxInner, playStrip, preloadStrips } from './boxes'

type Voice = { t: number; s: string }
const voice = data.voice as Voice[]
const frameTimes = data.frameTimes as number[]
const run = (data.runs as Array<Record<string, string>>).find((r) => r.run_id === REPLAY_RUN)!
const SPEED = 20
const runSeconds = Number(run.duration_s)

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const frameSrc = (i: number) => `/frames/${String(i).padStart(3, '0')}.jpg`
const sentenceAt = (t: number) => { let s = voice[0]; for (const v of voice) { if (v.t <= t + 1.5) s = v; else break } return s }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// Les étapes que la voix de 2021 dicte, horodatées dans les sous-titres réels de la vidéo.
export const VOICE_STEPS = [
  { t: 85.41, quote: 'à partir du menu factures fournisseurs', step: 'Open Supplier invoices, New invoice' },
  { t: 90.59, quote: 'choisir le fournisseur pour lequel vous créez la facture', step: 'Pick the supplier' },
  { t: 121.82, quote: 'choisissez la date de la facture', step: 'Set the invoice date' },
  { t: 142.29, quote: 'vous pouvez ajouter des produits et des services', step: 'Add the lines, price before tax, VAT' },
  { t: 176.54, quote: 'cliquez sur valider', step: 'Validate' },
]

type Step = {
  verb: string; tool: string; dur: number; sheet: string
  inH: string; outH: string
  inHtml: () => string
  play: (out: HTMLElement, tl: gsap.core.Timeline, dur: number) => void
  finalOut: () => string
}

const steps: Step[] = [
  {
    verb: 'Fetch', tool: 'yt-dlp', dur: 1.4, sheet: '7:00 video', inH: 'In, a public video', outH: 'Out, the file',
    inHtml: () => `<dl class="reader__kv"><dt>id</dt><dd>JZMgB1UItkk</dd><dt>title</dt><dd>Tutoriel 17 FR Dolibarr</dd><dt>published</dt><dd>5 February 2021</dd><dt>licence</dt><dd>CC BY</dd></dl>`,
    play: (out) => { out.innerHTML = `<p class="reader__big">7:00</p><p class="mono">JZMgB1UItkk.mp4, 420 s</p>` },
    finalOut: () => `<p class="reader__big">7:00</p><p class="mono">JZMgB1UItkk.mp4, 420 s</p>`,
  },
  {
    verb: 'Listen', tool: 'Gladia', dur: 3.2, sheet: 'voice, timed', inH: 'In, the audio track', outH: 'Out, sentences with timestamps',
    inHtml: () => `<p>The voice of the presenter, in French. This is where the rules are said.</p><p class="mono">language fr, solaria-3</p>`,
    play: (out, tl, dur) => {
      out.innerHTML = '<ul class="reader__lines"></ul>'
      const ul = out.firstElementChild!
      const lines = voice.slice(0, 9)
      lines.forEach((l, i) => tl.call(() => {
        const li = document.createElement('li'); li.innerHTML = `<span>${mmss(l.t)}</span><span>${esc(l.s)}</span>`
        ul.append(li); gsap.from(li, { clipPath: 'inset(0 0 100% 0)', duration: 0.24, ease: 'steps(3)' })
      }, [], (i / lines.length) * dur * 0.9))
    },
    finalOut: () => `<ul class="reader__lines">${voice.slice(0, 9).map((l) => `<li><span>${mmss(l.t)}</span><span>${esc(l.s)}</span></li>`).join('')}</ul>`,
  },
  {
    verb: 'Cut', tool: 'ffmpeg', dur: 2.6, sheet: '106 frames', inH: 'In, the video', outH: 'Out, the keyframes',
    inHtml: () => `<p>A frame is kept each time the screen changes enough: a new form, a new menu, a dialog.</p><p class="mono">scene change threshold</p>`,
    play: (out, tl, dur) => {
      out.innerHTML = '<div class="reader__thumbs"></div>'
      const box = out.firstElementChild!
      const n = frameTimes.length
      const batch = 6
      for (let i = 0; i < n; i += batch) tl.call(() => {
        for (let k = i; k < Math.min(n, i + batch); k++) {
          const img = new Image(); img.src = frameSrc(k + 1); img.alt = ''; img.decoding = 'async'; box.append(img)
        }
      }, [], (i / n) * dur * 0.92)
    },
    finalOut: () => `<div class="reader__thumbs">${frameTimes.map((_, k) => `<img src="${frameSrc(k + 1)}" alt="" decoding="async" loading="lazy">`).join('')}</div>`,
  },
  {
    verb: 'Pair', tool: 'local script', dur: 1.6, sheet: 'paired', inH: 'In, frames and sentences', outH: 'Out, each sentence on its frame',
    inHtml: () => `<p class="mono">106 frames, timestamped voice</p><p>Each sentence goes on the frame that is on screen while it is said.</p>`,
    play: (out) => { out.innerHTML = pairHtml() },
    finalOut: pairHtml,
  },
  {
    verb: 'Read', tool: 'Holo4, H Models API', dur: 3.4, sheet: 'steps, rules', inH: 'In, frames and their sentences', outH: 'Out, the steps of the skill',
    inHtml: () => `<div class="reader__five">${[33, 35, 40, 44, 49].map((k) => `<figure><img src="${frameSrc(k)}" alt="Keyframe ${k}"><figcaption>${mmss(frameTimes[k - 1])}</figcaption></figure>`).join('')}</div><p class="mono" style="margin-top:12px">holo4-27b reads the frames with what is said over them</p>`,
    play: (out, tl, dur) => {
      out.innerHTML = '<ul class="reader__lines"></ul>'
      const ul = out.firstElementChild!
      VOICE_STEPS.forEach((s, i) => tl.call(() => {
        const li = document.createElement('li'); li.innerHTML = `<span>${mmss(s.t)}</span><span><strong>${i + 1}. ${esc(s.step)}</strong><br>“${esc(s.quote)}”</span>`
        ul.append(li); gsap.from(li, { clipPath: 'inset(0 0 100% 0)', duration: 0.36, ease: 'steps(4)' })
      }, [], (i / VOICE_STEPS.length) * dur * 0.85))
    },
    finalOut: () => `<ul class="reader__lines">${VOICE_STEPS.map((s, i) => `<li><span>${mmss(s.t)}</span><span><strong>${i + 1}. ${esc(s.step)}</strong><br>“${esc(s.quote)}”</span></li>`).join('')}</ul>`,
  },
  {
    verb: 'Register', tool: 'H Agents API', dur: 1.6, sheet: 'rev 2', inH: 'In, the skill file', outH: 'Out, a skill revision and two agents',
    inHtml: () => `<p class="mono">SKILL.old-voice.md</p><p>The steps, the fields and the rules the video states, in the H Agents API skill format.</p>`,
    play: (out) => { out.innerHTML = registerHtml() },
    finalOut: registerHtml,
  },
  {
    verb: 'Run', tool: 'H agent in Chrome', dur: runSeconds / SPEED, sheet: `${run.steps} steps`, inH: 'In, the task', outH: `Out, the agent at work, ${SPEED}x`,
    inHtml: () => `<dl class="reader__kv"><dt>row</dt><dd>3, house rule: duplicate supplier</dd><dt>supplier</dt><dd>Transports Lemaire</dd><dt>reference</dt><dd>TL-3391</dd><dt>line</dt><dd>Livraison palette, 240.00 before tax, VAT 20%</dd><dt>limits</dt><dd class="mono">max_steps 40, max_time 600</dd></dl>`,
    play: (out, tl, dur) => {
      out.innerHTML = runHtml(0, 0, 0)
      const o = { p: 0 }
      tl.to(o, {
        p: 1, duration: dur, ease: 'none',
        onUpdate: () => {
          const [s, t, c] = out.querySelectorAll<HTMLElement>('[data-v]')
          if (!c) return
          s.textContent = String(Math.round(o.p * Number(run.steps)))
          t.textContent = String(Math.round(o.p * runSeconds))
          c.textContent = (o.p * Number(run.total_cost_usd)).toFixed(2)
        },
      }, 0)
    },
    finalOut: () => runHtml(Number(run.steps), runSeconds, Number(run.total_cost_usd)),
  },
  {
    verb: 'Verify', tool: 'SQL read', dur: 2, sheet: 'success', inH: 'In, the database', outH: 'Out, the verdict',
    inHtml: () => `<p class="mono">llx_facture_fourn where ref_supplier = 'TL-3391'</p><p>The verdict comes from the database, never from what the agent says about itself.</p>`,
    play: (out) => { out.innerHTML = verifyHtml() },
    finalOut: verifyHtml,
  },
  {
    verb: 'Repair', tool: 'local script', dur: 2, sheet: 'not run', inH: 'In, the drifts noted by the runs', outH: 'Out, the next revision of the skill',
    inHtml: () => `<p>“The tutorial creates the invoice from an approved purchase order. Here it was created directly from Billing, Supplier invoices, New invoice.”</p><p class="mono">noted by the agent, 1 run of 11</p>`,
    play: (out) => { out.innerHTML = repairHtml() },
    finalOut: repairHtml,
  },
]

function pairHtml() {
  return `<ul class="reader__lines">${[35, 40, 49].map((k) => {
    const s = sentenceAt(frameTimes[k - 1])
    return `<li><span>${mmss(frameTimes[k - 1])}</span><span style="display:grid;grid-template-columns:96px 1fr;gap:12px"><img src="${frameSrc(k)}" alt="Keyframe ${k}" style="width:96px;aspect-ratio:16/10;object-fit:cover">${esc(s.s)}</span></li>`
  }).join('')}</ul>`
}
function registerHtml() {
  return `<dl class="reader__kv"><dt>skill</dt><dd>tuto-JZMgB1UItkk-old-voice, revision ${run.skill_revision}</dd><dt>agent</dt><dd>clerk-JZMgB1UItkk-old-voice, with the skill</dd><dt>control</dt><dd>clerk-none-JZMgB1UItkk, same model, no skill</dd></dl>`
}
function runHtml(s: number, t: number, c: number) {
  return `<div class="reader__counters"><div><span class="reader__big" data-v>${s}</span><small>steps</small></div><div><span class="reader__big" data-v>${Math.round(t)}</span><small>seconds</small></div><div><span class="reader__big" data-v>${c.toFixed(2)}</span><small>USD</small></div></div><p>The agent clicks in Dolibarr 22 like a person, from the skill. H records every session, step by step.</p><a class="link-ext" href="/runs/${REPLAY_RUN}/">Open this run</a>`
}
function verifyHtml() {
  return `<dl class="reader__kv"><dt>agent says</dt><dd>invoice created, 288.00 with tax</dd><dt>database says</dt><dd><strong>${run.db_rows_before} row before, ${run.db_rows_after} after</strong>, 240.00 before tax, validated</dd><dt>verdict</dt><dd><span class="tag tag--ink">${run.verdict}</span></dd></dl>`
}
function repairHtml() {
  return '<p>A repair script rewrites the skill’s steps from these notes and registers the next revision.</p><p style="margin-top:12px">Not run this weekend: the notes are gaps of coverage, not screen changes, so there was nothing to repair.</p>'
}

const LEADS = [
  'The video, 7:00, downloaded',
  `${voice.length} lines of voice, each with its time`,
  `${frameTimes.length} keyframes, one per change of screen`,
  'Every sentence placed on its keyframe',
  '16 steps and 9 rules from 2021, no house rule among them',
  `Skill at revision ${run.skill_revision}`,
  `${run.steps} steps in ${run.duration_s} s, ${Number(run.total_cost_usd).toFixed(2)} USD`,
  `Success: ${run.db_rows_before} row before, ${run.db_rows_after} after`,
  'Repair built, not run: no screen change to repair',
]
const CRT = [false, true, false, false, true, false, true, true, false] // l'écran CRT quand un agent lit, analyse ou exécute
/** La ligne de tête s'écrit comme sur un terminal. */
function typeLead(el: HTMLElement) {
  const full = el.textContent ?? ''
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const o = { k: 0 }
  el.textContent = ''
  gsap.to(o, { k: full.length, duration: Math.min(0.9, 0.2 + full.length / 60), ease: 'none', onUpdate: () => (el.textContent = full.slice(0, Math.round(o.k))) })
}

export function mountChain(opts: { reduced: boolean; frozen: boolean }) {
  const rack = document.querySelector<HTMLOListElement>('[data-rack]')!
  const inH = document.querySelector<HTMLElement>('[data-reader-in-h]')!
  const outH = document.querySelector<HTMLElement>('[data-reader-out-h]')!
  const inB = document.querySelector<HTMLElement>('[data-reader-in]')!
  const outB = document.querySelector<HTMLElement>('[data-reader-out]')!
  const status = document.querySelector<HTMLElement>('[data-board-status]')!
  const replayBtn = document.querySelector<HTMLButtonElement>('[data-board-replay]')!
  const NS = 'http://www.w3.org/2000/svg'

  const boxes = steps.map((s, i) => {
    const li = document.createElement('li')
    li.className = 'box'
    li.innerHTML = `${boxInner(i, s.verb, esc(s.tool), 'waiting', esc(s.sheet))}<button type="button" aria-label="Step ${i + 1}, ${s.verb}, ${esc(s.tool)}"></button>`
    rack.append(li)
    li.querySelector('button')!.addEventListener('click', () => { if (!playing) show(i) })
    return li
  })
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'rack__link'); svg.setAttribute('aria-hidden', 'true')
  rack.append(svg)
  const links: SVGPathElement[] = []
  // filets bord à bord (v2, point 8) : positions de mise en page, rail pâle permanent, filet ambre tracé à la fin
  const rails: SVGPathElement[] = []
  function layoutLinks() {
    svg.setAttribute('viewBox', `0 0 ${rack.clientWidth} ${rack.clientHeight}`)
    boxes.slice(0, -1).forEach((b, i) => {
      const c = boxes[i + 1]
      const img = b.querySelector<HTMLElement>('.box__img')!
      const x0 = b.offsetLeft + b.offsetWidth * 0.5 + img.offsetWidth * 0.33, x1 = c.offsetLeft + c.offsetWidth * 0.5 - img.offsetWidth * 0.33, y = b.offsetTop + img.offsetTop + img.offsetHeight * 0.62
      if (i === 0) rack.style.setProperty('--shelf-y', `${b.offsetTop + img.offsetTop + img.offsetHeight - 6}px`)
      const d = `M ${x0} ${y} H ${x1}`
      if (!rails[i]) { rails[i] = document.createElementNS(NS, 'path'); rails[i].setAttribute('class', 'rail'); svg.prepend(rails[i]) }
      if (!links[i]) { const p = document.createElementNS(NS, 'path'); svg.append(p); links[i] = p }
      rails[i].setAttribute('d', d); links[i].setAttribute('d', d)
      if (!links[i].dataset.drawn) { const len = Math.max(1, x1 - x0); links[i].style.strokeDasharray = `${len}`; links[i].style.strokeDashoffset = `${len}` }
    })
  }
  setTimeout(preloadStrips, 2000)
  layoutLinks()
  addEventListener('resize', layoutLinks)
  addEventListener('load', layoutLinks)

  let tl: gsap.core.Timeline | null = null
  const subs: gsap.core.Timeline[] = []
  let playing = false
  const clock = () => new Date(new Date(run.started_at).getTime() + runSeconds * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris' })

  function show(i: number) {
    const s = steps[i]
    inH.textContent = s.inH; outH.textContent = s.outH
    inB.innerHTML = s.inHtml(); outB.innerHTML = `<p class="lead">${LEADS[i]}</p>${s.finalOut()}`
    outB.parentElement!.classList.toggle('reader__col--crt', CRT[i])
  }
  function setDone(i: number, animate: boolean) {
    const b = boxes[i]
    b.classList.remove('is-reading'); b.classList.add('is-done')
    b.querySelector('.box__state')!.textContent = i === 6 ? `done, ${run.duration_s} s` : 'done'
    const sheet = b.querySelector<HTMLElement>('.box__sheet')!
    const link = links[i]
    if (animate) {
      playStrip(b, 'done', 0.6)
      gsap.fromTo(sheet, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.36, ease: 'steps(4)', delay: 0.6 })
      if (link) { link.dataset.drawn = '1'; gsap.to(link, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut', delay: 0.5 }) }
    } else {
      gsap.set(sheet, { clipPath: 'inset(0% 0 0 0)' })
      if (link) { link.dataset.drawn = '1'; gsap.set(link, { strokeDashoffset: 0 }) }
    }
  }
  function reset() {
    boxes.forEach((b) => {
      b.classList.remove('is-reading', 'is-done', 'is-failed')
      b.querySelector('.box__state')!.textContent = 'waiting'
    })
    links.forEach((l) => { delete l.dataset.drawn })
    layoutLinks()
  }
  function finalState() {
    reset(); boxes.forEach((_, i) => setDone(i, false)); show(6)
    status.textContent = `Replay of 7 November 2026 finished. Run ${REPLAY_RUN}: ${run.verdict}, ${run.steps} steps, ${run.duration_s} s.`
  }
  function play() {
    if (playing) return
    playing = true; replayBtn.disabled = true
    tl?.kill(); subs.splice(0).forEach((x) => x.kill()); reset()
    tl = gsap.timeline({ onComplete: () => { playing = false; replayBtn.disabled = false; status.textContent = `Replay of 7 November 2026 finished. Run ${REPLAY_RUN}: ${run.verdict}, ${run.steps} steps, ${run.duration_s} s.` } })
    let at = 0
    steps.forEach((s, i) => {
      tl!.call(() => {
        boxes[i].classList.add('is-reading')
        playStrip(boxes[i], 'open', 0.9)
        boxes[i].querySelector('.box__state')!.textContent = 'reading'
        inH.textContent = s.inH; outH.textContent = s.outH
        inB.innerHTML = s.inHtml(); outB.innerHTML = `<p class="lead">${LEADS[i]}</p><div data-out-body></div>`
        outB.parentElement!.classList.toggle('reader__col--crt', CRT[i])
        typeLead(outB.querySelector('.lead')!)
        gsap.fromTo(inB, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.36, ease: 'steps(4)', clearProps: 'clipPath' })
      }, [], at)
      tl!.call(() => { const sub = gsap.timeline(); subs.push(sub); s.play(outB.querySelector<HTMLElement>('[data-out-body]') ?? outB, sub, s.dur) }, [], at + 0.3)
      at += Math.max(s.dur, 0.6) + 0.5
      tl!.call(() => setDone(i, true), [], at - 0.2)
    })
  }
  // la réponse au clic d'abord, le rejeu au tour suivant (INP)
  replayBtn.addEventListener('click', () => requestAnimationFrame(() => setTimeout(play, 0)))
  document.querySelector('[data-board]')!.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key
    if (k === 'r' || k === 'R') play()
  })

  return {
    arm() {
      if (opts.reduced || opts.frozen) { finalState(); return }
      show(0)
      ScrollTrigger.create({ trigger: rack, start: 'top 60%', once: true, onEnter: () => requestAnimationFrame(() => setTimeout(play, 0)) })
    },
  }
}
