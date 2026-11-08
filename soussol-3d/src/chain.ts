// Le schéma de la chaîne en rayonnage (concepts.md 2.5 et 3.6) : neuf boîtes à archives vues de dos. La boîte en
// cours coulisse de 34 px, son étiquette passe à l'ambre et le panneau de lecture montre ce qui entre et ce qui sort.
// Terminée, elle rentre, une feuille dépasse de son couvercle avec la sortie réelle, la liaison suivante se dessine.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import data from './data/tutorial.json'
import { REPLAY_RUN } from './config'

type Voice = { t: number; s: string }
const voice = data.voice as Voice[]
const frameTimes = data.frameTimes as number[]
const run = (data.runs as Array<Record<string, string>>).find((r) => r.run_id === REPLAY_RUN)!
const runRev1 = (data.runs as Array<Record<string, string>>).find((r) => r.run_id === 'JZMgB1UItkk-skill-1-1107-152836')!
const runRev2 = (data.runs as Array<Record<string, string>>).find((r) => r.run_id === 'JZMgB1UItkk-skill-1-1107-192947')!
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
    verb: 'Pair', tool: 'local script', dur: 1.6, sheet: 'storyboard', inH: 'In, frames and sentences', outH: 'Out, each sentence on its frame',
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
    verb: 'Register', tool: 'H Agents API', dur: 1.6, sheet: 'rev 2 pinned', inH: 'In, the skill file', outH: 'Out, a pinned skill and two agents',
    inHtml: () => `<p class="mono">SKILL.old-voice.md</p><p>The steps, the fields and the house rules, in the H Agents API skill format.</p>`,
    play: (out) => { out.innerHTML = registerHtml() },
    finalOut: registerHtml,
  },
  {
    verb: 'Run', tool: 'H agent in Chrome', dur: runSeconds / SPEED, sheet: `${run.steps} steps, ${run.duration_s} s`, inH: 'In, the task', outH: `Out, the agent at work, ${SPEED}x`,
    inHtml: () => `<dl class="reader__kv"><dt>row</dt><dd>3, house rule: duplicate supplier</dd><dt>supplier</dt><dd>Transports Lemaire</dd><dt>reference</dt><dd>TL-3391</dd><dt>line</dt><dd>Livraison palette, 240.00 before tax, VAT 20&nbsp;%</dd><dt>limits</dt><dd class="mono">max_steps 40, max_time 600</dd></dl>`,
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
    verb: 'Repair', tool: 'local script', dur: 2, sheet: 'rev 1 to 2', inH: 'In, the drifts noted by the runs', outH: 'Out, the next revision of the skill',
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
  return `<dl class="reader__kv"><dt>skill</dt><dd>tuto-JZMgB1UItkk-old-voice, revision ${run.skill_revision}, pinned</dd><dt>agent</dt><dd>clerk-JZMgB1UItkk-old-voice, with the skill</dd><dt>control</dt><dd>clerk-none-JZMgB1UItkk, same model, no skill</dd></dl>`
}
function runHtml(s: number, t: number, c: number) {
  return `<div class="reader__counters"><div><span class="reader__big" data-v>${s}</span><small>steps</small></div><div><span class="reader__big" data-v>${Math.round(t)}</span><small>seconds</small></div><div><span class="reader__big" data-v>${c.toFixed(2)}</span><small>USD</small></div></div><p>The agent clicks in Dolibarr 22 like a person, from the skill. Every session has a public replay.</p><a class="link-ext" href="${run.share_url}" rel="noopener" target="_blank">Watch this run on H</a>`
}
function verifyHtml() {
  return `<dl class="reader__kv"><dt>agent says</dt><dd>invoice created, 288.00 with tax</dd><dt>database says</dt><dd><strong>${run.db_rows_before} row before, ${run.db_rows_after} after</strong>, 240.00 before tax, validated</dd><dt>verdict</dt><dd><span class="tag tag--ink">${run.verdict}</span></dd></dl>`
}
function repairHtml() {
  return `<dl class="reader__kv"><dt>revision 1</dt><dd>row 1, ${runRev1.verdict} in ${runRev1.steps} steps</dd><dt>revision 2</dt><dd>row 1, ${runRev2.verdict} in ${runRev2.steps} steps, ${runRev2.duration_s} s</dd></dl><p style="margin-top:12px">The drift goes back into the skill, the next runs follow revision 2.</p>`
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
    li.innerHTML = `<div class="box__sheet" aria-hidden="true">${esc(s.sheet)}</div><span class="box__hole" aria-hidden="true"></span><span class="box__label"><span class="box__verb">${s.verb}</span><span class="box__tool">${esc(s.tool)}</span></span><span class="box__state">waiting</span><button type="button" aria-label="Step ${i + 1}, ${s.verb}, ${esc(s.tool)}"></button>`
    rack.append(li)
    li.querySelector('button')!.addEventListener('click', () => { if (!playing) show(i) })
    return li
  })
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'rack__link'); svg.setAttribute('aria-hidden', 'true')
  rack.append(svg)
  const links: SVGPathElement[] = []
  function layoutLinks() {
    const r = rack.getBoundingClientRect()
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
    boxes.slice(0, -1).forEach((b, i) => {
      const a = b.getBoundingClientRect(), c = boxes[i + 1].getBoundingClientRect()
      const y = a.top - r.top + 150
      const d = `M ${a.right - r.left} ${y} H ${c.left - r.left}`
      if (!links[i]) { const p = document.createElementNS(NS, 'path'); svg.append(p); links[i] = p }
      links[i].setAttribute('d', d)
      if (!links[i].dataset.drawn) { const len = c.left - a.right; links[i].style.strokeDasharray = `${len}`; links[i].style.strokeDashoffset = `${len}` }
    })
  }
  layoutLinks()
  addEventListener('resize', layoutLinks)

  let tl: gsap.core.Timeline | null = null
  const subs: gsap.core.Timeline[] = []
  let playing = false
  const clock = () => new Date(new Date(run.started_at).getTime() + runSeconds * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris' })

  function show(i: number) {
    const s = steps[i]
    inH.textContent = s.inH; outH.textContent = s.outH
    inB.innerHTML = s.inHtml(); outB.innerHTML = s.finalOut()
  }
  function setDone(i: number, animate: boolean) {
    const b = boxes[i]
    b.classList.remove('is-reading'); b.classList.add('is-done')
    b.querySelector('.box__state')!.textContent = i === 6 ? `done ${clock()}` : 'done'
    const sheet = b.querySelector<HTMLElement>('.box__sheet')!
    const link = links[i]
    if (animate) {
      gsap.to(sheet, { y: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.42, ease: 'friction', delay: 0.18 })
      if (link) { link.dataset.drawn = '1'; gsap.to(link, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut', delay: 0.3 }) }
    } else {
      gsap.set(sheet, { y: 0, clipPath: 'inset(0 0 0% 0)' })
      if (link) { link.dataset.drawn = '1'; gsap.set(link, { strokeDashoffset: 0 }) }
    }
  }
  function reset() {
    boxes.forEach((b) => {
      b.classList.remove('is-reading', 'is-done', 'is-failed')
      b.querySelector('.box__state')!.textContent = 'waiting'
      gsap.set(b.querySelector('.box__sheet'), { y: '100%', clipPath: 'inset(0 0 100% 0)' })
    })
    links.forEach((l) => { delete l.dataset.drawn })
    layoutLinks()
  }
  function finalState() {
    reset(); boxes.forEach((_, i) => setDone(i, false)); show(6)
    status.textContent = `Replay of 7 Nov 2026 finished. Run ${REPLAY_RUN}: ${run.verdict}, ${run.steps} steps, ${run.duration_s} s.`
  }
  function play() {
    if (playing) return
    playing = true; replayBtn.disabled = true
    tl?.kill(); subs.splice(0).forEach((x) => x.kill()); reset()
    tl = gsap.timeline({ onComplete: () => { playing = false; replayBtn.disabled = false; status.textContent = `Replay of 7 Nov 2026 finished. Run ${REPLAY_RUN}: ${run.verdict}, ${run.steps} steps, ${run.duration_s} s.` } })
    let at = 0
    steps.forEach((s, i) => {
      tl!.call(() => {
        boxes[i].classList.add('is-reading')
        boxes[i].querySelector('.box__state')!.textContent = 'reading'
        inH.textContent = s.inH; outH.textContent = s.outH
        inB.innerHTML = s.inHtml(); outB.innerHTML = ''
        gsap.fromTo(inB, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.36, ease: 'steps(4)', clearProps: 'clipPath' })
      }, [], at)
      tl!.call(() => { const sub = gsap.timeline(); subs.push(sub); s.play(outB, sub, s.dur) }, [], at + 0.3)
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
