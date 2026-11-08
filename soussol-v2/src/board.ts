// La démo : le rayonnage des neuf agents, pilotable (lecture, pas à pas, aller à l'étape, clavier) et rejoué hors
// ligne depuis les vraies données du 7 novembre, ou branché sur l'app locale quand elle répond (status.json relu 2 s).
import { gsap } from 'gsap'
import { boot, reduced } from './app'
import data from './data/app.json'
import { playStrip, preloadStrips } from './boxes'
;(window as unknown as { __pageBoot: boolean }).__pageBoot = true

type Run = (typeof data.runs)[number] & { agent_said?: string; supplier?: string | null }
type Shot = (typeof data.shots)[number]
const runs = data.runs as Run[]
const shots = data.shots as Shot[]
const VOICE_STEPS = [
  { t: 85.41, quote: 'à partir du menu factures fournisseurs', step: 'Open Supplier invoices, New invoice' },
  { t: 90.59, quote: 'choisir le fournisseur pour lequel vous créez la facture', step: 'Pick the supplier' },
  { t: 121.82, quote: 'choisissez la date de la facture', step: 'Set the invoice date' },
  { t: 142.29, quote: 'vous pouvez ajouter des produits et des services', step: 'Add the lines, price before tax, VAT' },
  { t: 176.54, quote: 'cliquez sur valider', step: 'Validate' },
]
const SPEED = 20
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const tc = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const frameC = (n: number) => `/frames-c/${String(n).padStart(3, '0')}.jpg`
const shotAt = (t: number) => { let s = shots[0]; for (const x of shots) { if (x.t <= t) s = x; else break } return s }
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!

type StepView = { inH: string; outH: string; inHtml: string; outHtml: string; sheet: string; dur: number; state: 'done' | 'failed' | 'skipped'; t?: number; skill?: number; lead?: string; crt?: boolean }

function viewsFor(r: Run): StepView[] {
  const list = viewsList(r)
  const ok = r.verdict === 'success'
  const leads = [
    'The video, 7:00, downloaded',
    `${data.voice.length} lines of voice, each with its time`,
    `${data.video.frames} keyframes, one per change of screen`,
    'Every sentence placed on its keyframe',
    '16 steps and 9 rules from 2021, no house rule among them',
    r.arm === 'none' ? 'One control agent, no skill' : `Skill at revision ${r.revision}`,
    `${r.steps ?? 0} steps in ${r.duration} s${r.cost != null ? `, ${r.cost.toFixed(2)} USD` : ''}`,
    ok ? `Success: ${r.before} row before, ${r.after} after` : `${r.verdict}: no new invoice in the database`,
    'Repair built, not run: no screen change to repair',
  ]
  const agents = [false, true, false, false, true, false, true, true, false] // lecture, analyse, exécution : l'écran CRT
  const bars = `<div class="bars" aria-hidden="true"><div class="bar"><span class="bar__fill" style="--h:${Math.min(1, (r.before ?? 0) / Math.max(r.after ?? 1, r.before ?? 1, 1))}"></span><span class="bar__k mono">before ${r.before}</span></div><div class="bar bar--after"><span class="bar__fill" style="--h:${Math.min(1, (r.after ?? 0) / Math.max(r.after ?? 1, r.before ?? 1, 1))}"></span><span class="bar__k mono">after ${r.after}</span></div></div>`
  if (list[7]) list[7] = { ...list[7], outHtml: list[7].outHtml + bars }
  return list.map((v, i) => ({ ...v, lead: v.state === 'skipped' && r.arm === 'none' ? 'Not used by the control agent' : leads[i], crt: v.state !== 'skipped' && agents[i] }))
}

function viewsList(r: Run): StepView[] {
  const control = r.arm === 'none'
  const ok = r.verdict === 'success'
  const created = (r.after ?? 0) > (r.before ?? 0)
  const skip = (what: string): Omit<StepView, 'inH' | 'outH'> => ({ inHtml: `<p>${what}</p>`, outHtml: '<p class="muted">Not used by the control agent.</p>', sheet: 'not used', dur: 0.8, state: 'skipped' })
  return [
    { inH: 'In, a public video', outH: 'Out, the file', inHtml: `<dl class="kv"><div><dt>id</dt><dd><code>${data.video.id}</code></dd></div><div><dt>title</dt><dd>${esc(data.video.title)}</dd></div><div><dt>published</dt><dd>5 February 2021</dd></div><div><dt>licence</dt><dd>CC BY</dd></div></dl>`, outHtml: '<p class="big">7:00</p><p class="mono">JZMgB1UItkk.mp4, 420 s</p>', sheet: '7:00 video', dur: 1.4, state: 'done', t: 0 },
    control ? { inH: 'In, the audio track', outH: 'Out', ...skip('The control agent gets the one-sentence task only, no tutorial.') } :
    { inH: 'In, the audio track', outH: 'Out, sentences with timestamps', inHtml: '<p>The voice of the presenter, in French: this is where the rules are said.</p><p class="mono">Gladia, solaria-3, language fr</p>', outHtml: `<ul class="lines">${data.voice.slice(18, 27).map((v) => `<li><span class="mono">${tc(v.t)}</span><span lang="fr">${esc(v.s)}</span></li>`).join('')}</ul>${data.voice_source === 'captions' ? '<p class="muted">Shown here: the video’s own captions, the Gladia transcript is not in this snapshot.</p>' : ''}`, sheet: 'voice, timed', dur: 2.6, state: 'done', t: 54 },
    control ? { inH: 'In, the video', outH: 'Out', ...skip('No tutorial for this arm.') } :
    { inH: 'In, the video', outH: `Out, ${data.video.frames} keyframes`, inHtml: '<p>A frame is kept each time the screen changes enough: a new form, a new menu, a dialog.</p>', outHtml: `<div class="thumbs">${shots.map((s) => `<img src="/frames/${String(s.n).padStart(3, '0')}.jpg" alt="" width="64" height="40" loading="lazy" decoding="async" />`).join('')}</div>`, sheet: `${data.video.frames} frames`, dur: 2.2, state: 'done', t: 70 },
    control ? { inH: 'In, frames and sentences', outH: 'Out', ...skip('No storyboard for this arm.') } :
    { inH: 'In, frames and sentences', outH: 'Out, each sentence on its frame', inHtml: `<p class="mono">${data.video.frames} frames, ${data.voice.length} ${data.voice_source === 'captions' ? 'caption lines' : 'sentences'}</p>`, outHtml: `<ul class="lines">${[33, 35, 40].map((n) => { const s = shots[n - 1]; return `<li><span class="mono">${tc(s.t)}</span><span class="pairline"><img src="${frameC(n)}" alt="Keyframe ${n}" width="96" height="60" /><span lang="fr">${esc(s.said)}</span></span></li>` }).join('')}</ul>`, sheet: 'paired', dur: 1.6, state: 'done', t: 85 },
    control ? { inH: 'In, frames', outH: 'Out', ...skip('No skill for this arm.') } :
    { inH: 'In, frames and their sentences', outH: 'Out, the steps of the skill', inHtml: `<div class="five">${[33, 35, 40, 44, 49].map((n) => `<figure><img src="${frameC(n)}" alt="Keyframe ${n}" width="96" height="60" /><figcaption class="mono">${tc(shots[n - 1].t)}</figcaption></figure>`).join('')}</div><p class="mono">holo4-27b on the H Models API</p>`, outHtml: `<ol class="steps">${VOICE_STEPS.map((s) => `<li><strong>${esc(s.step)}</strong> <span class="mono">${tc(s.t)}</span></li>`).join('')}</ol>${r.arm === 'new-voice' ? '<p class="muted">The house rules come from the internal video, never from the task.</p>' : '<p class="muted">No house rule in this skill: the 2021 video never states one.</p>'}`, sheet: 'steps, rules', dur: 2.4, state: 'done', t: 121, skill: 4 },
    control ? { inH: 'In, no skill', outH: 'Out, one agent', inHtml: '<p>The control agent: same model, same instructions, no skill.</p>', outHtml: '<dl class="kv"><div><dt>agent</dt><dd><code>clerk-none-JZMgB1UItkk</code></dd></div></dl>', sheet: 'control agent', dur: 1.2, state: 'done' } :
    { inH: 'In, the skill file', outH: 'Out, a skill revision and two agents', inHtml: '<p class="mono">SKILL.old-voice.md</p><p>The steps, the fields and the rules the video states, in the H Agents API skill format.</p>', outHtml: `<dl class="kv"><div><dt>skill</dt><dd><code>tuto-JZMgB1UItkk-old-voice</code>, revision ${r.revision}</dd></div><div><dt>agent</dt><dd><code>clerk-JZMgB1UItkk-old-voice</code></dd></div><div><dt>control</dt><dd><code>clerk-none-JZMgB1UItkk</code></dd></div></dl>`, sheet: `rev ${r.revision}`, dur: 1.4, state: 'done', t: 142, skill: 5 },
    { inH: 'In, the task', outH: `Out, the agent at work, ${SPEED}x`, inHtml: `<dl class="kv"><div><dt>row</dt><dd>${r.row}${r.rule ? `, house rule ${esc(r.rule)}` : ''}</dd></div><div><dt>supplier</dt><dd>${esc(r.supplier ?? 'in data/factures.csv')}</dd></div><div><dt>limits</dt><dd class="mono">max_steps 40, max_time 600</dd></div></dl>`, outHtml: `<div class="counters"><div><span class="big" data-c="steps">${r.steps ?? 0}</span><small>steps</small></div><div><span class="big" data-c="time">${r.duration}</span><small>seconds</small></div><div><span class="big" data-c="cost">${(r.cost ?? 0).toFixed(2)}</span><small>USD${r.cost == null ? ', not recorded' : ''}</small></div></div><div class="ticks" data-ticks aria-hidden="true">${Array.from({ length: r.steps ?? 0 }, () => '<span></span>').join('')}</div><a class="link-ext" href="/runs/${r.id}/">Open this run</a>`, sheet: `${r.steps ?? 0} steps`, dur: Math.max(2, (r.duration ?? 0) / SPEED), state: 'done', t: 176 },
    { inH: 'In, the database', outH: 'Out, the verdict', inHtml: '<p class="mono">llx_facture_fourn</p><p>The verdict comes from the database, never from what the agent says about itself.</p>', outHtml: `<dl class="kv"><div><dt>agent says</dt><dd>${r.agent_created === true ? `invoice created${r.agent_ttc ? `, ${r.agent_ttc.toFixed(2)} with tax` : ''}` : r.agent_said ? esc(r.agent_said).slice(0, 220) : 'nothing created'}</dd></div><div><dt>database says</dt><dd><strong>${r.before} row${r.before === 1 ? '' : 's'} before, <span class="drop" data-drop>${r.after}</span> after</strong>${created && r.sql_ht ? `, ${r.sql_ht.toFixed(2)} before tax, validated` : ', no new invoice'}</dd></div><div><dt>verdict</dt><dd><span class="tag stamp ${ok ? 'tag--ink' : 'tag--fail'}" data-stamp>${esc(r.verdict)}</span> ${esc(r.note ?? '')}</dd></div></dl>`, sheet: ok ? 'success' : r.verdict, dur: 1.8, state: ok ? 'done' : 'failed' },
    control ? { inH: 'In, drifts', outH: 'Out', ...skip('No skill to repair for this arm.') } :
    { inH: 'In, the drifts noted by the runs', outH: 'Out, the next revision', inHtml: `<p lang="fr">${esc(data.drift[0]?.fr)}</p><p class="mono">noted by the agent, 1 run of 11</p>`, outHtml: '<p>A repair script rewrites the skill’s steps from these notes and registers the next revision.</p><p class="muted">Not run this weekend: the notes are gaps of coverage, not screen changes, so there was nothing to repair.</p>', sheet: 'not run', dur: 1.6, state: 'skipped' },
  ]
}

/** L'écriture façon terminal : les nœuds de texte apparaissent caractère par caractère, curseur bloc à la fin.
 *  Les chiffres animés (compteurs) et les images ne sont pas tapés. */
function typeOut(root: HTMLElement, seconds: number) {
  const nodes: { n: Text; full: string }[] = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() && !(n.parentElement?.closest('[data-c], .ticks, .bars')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) })
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push({ n: n as Text, full: n.textContent! })
  const total = nodes.reduce((a, x) => a + x.full.length, 0)
  if (!total) return
  nodes.forEach((x) => (x.n.textContent = ''))
  const caret = document.createElement('span'); caret.className = 'caret'; caret.setAttribute('aria-hidden', 'true')
  const o = { k: 0 }
  gsap.to(o, { k: total, duration: Math.min(seconds, 0.4 + total / 900), ease: 'none', onUpdate: () => {
    let left = Math.round(o.k)
    for (const x of nodes) { const take = Math.max(0, Math.min(x.full.length, left)); x.n.textContent = x.full.slice(0, take); left -= take; if (take < x.full.length) { x.n.after(caret); return } }
  }, onComplete: () => { nodes.forEach((x) => (x.n.textContent = x.full)); caret.remove() } })
}

boot((live) => {
  const boxes = Array.from(document.querySelectorAll<HTMLLIElement>('[data-rack] .box'))
  const rackEl = $<HTMLOListElement>('[data-rack]')
  const status = $('[data-board-status]')
  const sel = $<HTMLSelectElement>('[data-run-select]')
  const playBtn = $<HTMLButtonElement>('[data-play]')
  const inH = $('[data-reader-in-h]'), outH = $('[data-reader-out-h]'), inB = $('[data-reader-in]'), outB = $('[data-reader-out]')
  const tFrame = $<HTMLImageElement>('[data-t-frame]'), tNow = $('[data-t-now]'), tQuote = $('[data-t-quote]')
  const sSteps = $('[data-s-steps]'), aCounters = $('[data-a-counters]'), aBody = $('[data-a-body]'), qBody = $('[data-q-body]')
  sSteps.innerHTML = VOICE_STEPS.map((s) => `<li>${esc(s.step)} <span class="mono">${tc(s.t)}</span></li>`).join('')

  // liaisons entre boîtes : un filet qui se dessine quand l'étape se ferme
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'rack__link'); svg.setAttribute('aria-hidden', 'true'); rackEl.append(svg)
  const links: SVGPathElement[] = []
  // 8. les filets bord à bord : positions de mise en page (offset), insensibles aux boîtes soulevées ; un rail pâle
  // toujours là, et par dessus le filet ambre qui se trace quand l'étape se ferme. Un pixel de recouvrement de chaque côté.
  const rails: SVGPathElement[] = []
  const layout = () => {
    svg.setAttribute('viewBox', `0 0 ${rackEl.clientWidth} ${rackEl.clientHeight}`)
    boxes.slice(0, -1).forEach((b, i) => {
      const c = boxes[i + 1]
      const img = b.querySelector<HTMLElement>('.box__img')!
      const x0 = b.offsetLeft + b.offsetWidth * 0.5 + img.offsetWidth * 0.33, x1 = c.offsetLeft + c.offsetWidth * 0.5 - img.offsetWidth * 0.33, y = b.offsetTop + img.offsetTop + img.offsetHeight * 0.62
      if (i === 0) rackEl.style.setProperty('--shelf-y', `${b.offsetTop + img.offsetTop + img.offsetHeight - 6}px`)
      if (!rails[i]) { rails[i] = document.createElementNS(NS, 'path'); rails[i].setAttribute('class', 'rail'); svg.prepend(rails[i]) }
      if (!links[i]) { links[i] = document.createElementNS(NS, 'path'); svg.append(links[i]) }
      const d = `M ${x0} ${y} H ${x1}`
      rails[i].setAttribute('d', d); links[i].setAttribute('d', d)
      const len = Math.max(1, x1 - x0); links[i].style.strokeDasharray = `${len}`
      if (!links[i].dataset.on) links[i].style.strokeDashoffset = `${len}`
    })
  }
  preloadStrips()
  layout(); addEventListener('resize', layout)
  addEventListener('load', layout)

  let run = runs.find((r) => r.id === sel.value)!
  let views = viewsFor(run)
  let k = -1 // étape en cours ; -1 avant le départ
  let playing = false
  let timer: gsap.core.Tween | gsap.core.Timeline | null = null
  let lastStepAt = 0

  const stopAt = () => views.findIndex((v) => v.state === 'failed') // le schéma s'arrête sur un échec
  const lastIndex = () => (stopAt() >= 0 ? stopAt() : views.length - 1)

  function paintBox(i: number, mode: 'waiting' | 'reading' | 'done' | 'failed' | 'skipped', animate: boolean) {
    const b = boxes[i]
    const was = b.className
    b.className = `box is-${mode}`
    const state = b.querySelector<HTMLElement>('.box__state')!
    const sheet = b.querySelector<HTMLElement>('.box__sheet')!
    state.textContent = mode === 'done' ? (i === 6 ? `done, ${run.duration} s` : 'done') : mode === 'skipped' ? 'not used' : mode
    const link = links[i]
    const fresh = !was.includes(`is-${mode}`)
    // la boîte rendue : séquence d'ouverture quand elle se met à lire, séquence de fin quand sa feuille sort
    if (animate && fresh && !reduced && mode === 'reading') playStrip(b, 'open', 0.9)
    if (mode === 'done' || mode === 'failed' || mode === 'skipped') {
      sheet.textContent = views[i].sheet
      if (animate && fresh && !reduced) {
        if (mode === 'done') playStrip(b, 'done', 0.6)
        gsap.fromTo(sheet, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.36, ease: 'steps(4)', delay: 0.6 })
        if (link && mode !== 'failed') { link.dataset.on = '1'; gsap.to(link, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut', delay: 0.5 }) }
      } else {
        gsap.set(sheet, { clipPath: 'inset(0% 0 0 0)' })
        if (link) { if (mode !== 'failed') { link.dataset.on = '1'; gsap.set(link, { strokeDashoffset: 0 }) } }
      }
    } else {
      sheet.textContent = ''
      if (link) { delete link.dataset.on; gsap.set(link, { strokeDashoffset: link.style.strokeDasharray }) }
    }
  }

  function paintDesk(i: number) {
    const v = views[Math.max(0, i)]
    const t = views.slice(0, Math.max(0, i) + 1).reduce((acc, x) => (x.t != null ? x.t : acc), 0)
    const s = i < 0 ? shots[34] : shotAt(t) // à l'étape 0, l'image clé du formulaire de facture plutôt que l'écran titre bleu nuit
    tFrame.src = frameC(s.n); tFrame.alt = `Keyframe ${s.n} of the 2021 tutorial, at ${tc(s.t)}`
    tNow.textContent = tc(s.t)
    tQuote.textContent = i < 0 ? 'The 2021 tutorial, keyframe 35 of 106. Press Play to follow the run.' : s.said ? `“${s.said}”` : 'The 2021 tutorial, 7:00.'
    const sk = views.slice(0, Math.max(0, i) + 1).reduce((acc, x) => (x.skill != null ? x.skill : acc), -1)
    sSteps.querySelectorAll('li').forEach((li, j) => { li.classList.toggle('is-on', j === sk - 1); li.classList.toggle('is-done', j < sk - 1 || i >= 6) })
    $('[data-s-rev]').textContent = run.arm === 'none' ? 'none, control agent' : `tuto-JZMgB1UItkk-old-voice, revision ${run.revision}`
    if (i >= 6) {
      aCounters.textContent = `${run.steps ?? 0} steps, ${run.duration} s`
      aBody.innerHTML = run.agent_said ? `<blockquote class="said">${esc(run.agent_said)}</blockquote>` : `<p>${run.agent_created ? 'The agent says it created and validated the invoice.' : 'No answer recorded.'}</p>`
    } else { aCounters.textContent = '0 steps, 0 s'; aBody.innerHTML = '<p class="muted">Waiting for step 7.</p>' }
    if (i >= 7) qBody.innerHTML = `<p class="mono">${run.before} rows before, ${run.after} after</p><p>${(run.after ?? 0) > (run.before ?? 0) ? `New invoice, ${run.sql_ht?.toFixed(2)} before tax, <code>fk_statut</code> 1` : 'No new invoice for this reference.'}</p>`
    else qBody.innerHTML = '<p class="muted">Read after the run, at step 8.</p>'
  }

  function show(i: number, animate: boolean) {
    const v = views[i]
    inH.textContent = v.inH; outH.textContent = v.outH
    inB.innerHTML = v.inHtml
    // 9. ce qu'il faut lire en premier, en tête ; 11. l'écran CRT quand c'est un agent qui lit, analyse ou exécute
    outB.innerHTML = `<p class="lead">${esc(v.lead)}</p>${v.outHtml}`
    outB.parentElement!.classList.toggle('reader__col--crt', !!v.crt)
    if (animate && !reduced) {
      gsap.fromTo(inB, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.36, ease: 'steps(4)', clearProps: 'clipPath' })
      typeOut(outB, v.crt ? 1.1 : 0.7) // 10. l'écriture façon terminal
      const bars = outB.querySelectorAll<HTMLElement>('.bar__fill')
      if (bars.length) gsap.from(bars, { scaleY: 0, duration: 0.6, ease: 'power2.out', stagger: 0.25, delay: 0.5 })
    }
    if (i === 6 && animate && !reduced) {
      const o = { p: 0 }
      const ticks = Array.from(outB.querySelectorAll<HTMLElement>('[data-ticks] span'))
      const q = (c: string) => outB.querySelector<HTMLElement>(`[data-c="${c}"]`)
      work = gsap.to(o, { p: 1, duration: playing ? v.dur : 2.4, ease: 'none', onUpdate: () => {
        const n = Math.round(o.p * (run.steps ?? 0))
        q('steps') && (q('steps')!.textContent = String(n))
        q('time') && (q('time')!.textContent = String(Math.round(o.p * (run.duration ?? 0))))
        q('cost') && (q('cost')!.textContent = (o.p * (run.cost ?? 0)).toFixed(2))
        ticks.forEach((t, j) => t.classList.toggle('on', j < n))
        aCounters.textContent = `${n} steps, ${Math.round(o.p * (run.duration ?? 0))} s, ${(o.p * (run.cost ?? 0)).toFixed(2)} USD`
      } })
    } else if (i === 6) outB.querySelectorAll('[data-ticks] span').forEach((t) => t.classList.add('on'))
    // Verify : la base répond, le compte de lignes tombe, le verdict se pose comme un tampon
    if (i === 7 && animate && !reduced) {
      const drop = outB.querySelector<HTMLElement>('[data-drop]'), stamp = outB.querySelector<HTMLElement>('[data-stamp]')
      const tl = gsap.timeline({ delay: 0.4 })
      if (drop) tl.fromTo(drop, { yPercent: -120, clipPath: 'inset(0 0 100% 0)' }, { yPercent: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.42, ease: 'friction' })
      if (stamp) tl.fromTo(stamp, { scale: 1.5, rotate: -6 }, { scale: 1, rotate: 0, duration: 0.32, ease: 'power3.in' }, '+=0.2')
    }
  }

  /** Aller à l'étape i : tout ce qui précède est rangé avec sa feuille, l'étape i lit. */
  let work: gsap.core.Tween | null = null
  function meter(i: number, dur: number, animate: boolean) {
    const m = boxes[i].querySelector<HTMLElement>('.box__meter')!
    gsap.killTweensOf(m)
    if (animate && playing && !reduced) gsap.fromTo(m, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: 'none' })
    else gsap.set(m, { scaleX: 1 })
  }
  // la sortie d'une boîte voyage vers la suivante le long du filet : une image clé, une phrase, le skill
  function flight(i: number) {
    if (reduced || i >= boxes.length - 1) return
    const tok = document.createElement('div')
    tok.className = 'token'
    tok.setAttribute('aria-hidden', 'true')
    const v = views[i]
    // 12. la vidéo qui passe d'une boîte à l'autre : un petit film des images clés qui défile pendant le trajet
    const film = i >= 1 && i <= 3
    if (film) { tok.classList.add('token--film'); tok.innerHTML = `<img src="${frameC(33)}" alt="" width="96" height="60" /><span class="mono">${esc(v.sheet)}</span>` }
    else tok.textContent = v.sheet
    rackEl.append(tok)
    const rr = rackEl.getBoundingClientRect(), a = boxes[i].getBoundingClientRect(), c = boxes[i + 1].getBoundingClientRect()
    const x0 = a.left - rr.left + a.width / 2, x1 = c.left - rr.left + c.width / 2, y0 = a.top - rr.top + a.width * 0.6
    gsap.set(tok, { x: x0, y: y0, xPercent: -50, yPercent: -100 })
    const seq = [33, 35, 40, 44, 49, 52]
    const img = tok.querySelector('img')
    gsap.timeline({ onComplete: () => tok.remove(), onUpdate: function (this: gsap.core.Timeline) { if (img) img.src = frameC(seq[Math.min(seq.length - 1, Math.floor(this.progress() * seq.length))]) } })
      .to(tok, { y: y0 - 36, duration: 0.22, ease: 'power2.out' })
      .to(tok, { x: x1, duration: 0.5, ease: 'power2.inOut' }, '<0.05')
      .to(tok, { y: y0 + 40, clipPath: 'inset(0 0 100% 0)', duration: 0.3, ease: 'power2.in' })
  }
  // fin d'agent : l'étiquette bascule à l'encre par balayage cathodique, en quatre bandes
  function flip(i: number, failed: boolean) {
    if (reduced) return
    const label = boxes[i].querySelector<HTMLElement>('.box__label')!
    const f = document.createElement('span'); f.className = `box__flip${failed ? ' box__flip--fail' : ''}`; f.setAttribute('aria-hidden', 'true')
    label.append(f)
    gsap.fromTo(f, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.36, ease: 'steps(4)', onComplete: () => f.remove() })
  }

  function goTo(i: number, animate = false) {
    i = Math.max(0, Math.min(lastIndex(), i))
    for (let j = 0; j < boxes.length; j++) {
      if (j < i) paintBox(j, views[j].state === 'skipped' ? 'skipped' : 'done', animate && j === i - 1)
      else if (j === i) paintBox(j, 'reading', false)
      else paintBox(j, 'waiting', false)
    }
    work?.kill()
    if (animate && i > 0 && !reduced) flight(i - 1)
    meter(i, views[i].dur, animate)
    k = i
    show(i, animate); paintDesk(i)
    status.textContent = `${live ? 'Live' : 'Replay of 7 November 2026'}, step ${i + 1} of 9, ${boxes[i].querySelector('button')?.getAttribute('aria-label')?.split(', ')[1] ?? ''}.`
  }
  function finish(animate: boolean) {
    const last = lastIndex()
    for (let j = 0; j <= last; j++) paintBox(j, j === last && views[j].state === 'failed' ? 'failed' : views[j].state === 'skipped' ? 'skipped' : 'done', animate && j === last)
    for (let j = last + 1; j < boxes.length; j++) paintBox(j, 'waiting', false)
    if (k !== last) show(last, false)
    k = last + 1; paintDesk(8)
    playing = false; playBtn.textContent = 'Play'
    const failed = views[last].state === 'failed'
    status.textContent = `${live ? 'Live' : 'Replay of 7 November 2026'} finished. Run ${run.id}: ${run.verdict}${failed ? `, the chain stops at Verify: ${run.note ?? ''}` : `, ${run.steps} steps, ${run.duration} s`}.`
  }
  function schedule() {
    timer?.kill()
    if (!playing) return
    const v = views[k]
    timer = gsap.delayedCall(Math.max(0.6, v.dur), () => step(1, true))
  }
  function step(d: number, animate = true) {
    const now = performance.now()
    if (!animate && now - lastStepAt < 200) return // verrou anti double clic
    lastStepAt = now
    const next = k + d
    if (next > lastIndex()) { finish(animate); return }
    if (next < 0) return
    goTo(next, animate && d > 0); schedule()
  }
  function play() {
    if (playing) { playing = false; timer?.kill(); playBtn.textContent = 'Play'; return }
    playing = true; playBtn.textContent = 'Pause'
    if (k < 0 || k > lastIndex()) { k = -1 }
    if (k < 0) step(1, true); else schedule()
  }
  function reset() {
    timer?.kill(); playing = false; playBtn.textContent = 'Play'; k = -1
    boxes.forEach((_, j) => paintBox(j, 'waiting', false)); paintDesk(-1)
    inH.textContent = 'In'; outH.textContent = 'Out'
    inB.innerHTML = '<p>Choose a run and press Play. Each step shows what it reads here.</p>'; outB.innerHTML = '<p>And what it produces here.</p>'
    status.textContent = `${live ? 'Live' : 'Replay of 7 November 2026'}, step 0 of 9. Press Play or Space.`
  }

  playBtn.addEventListener('click', play)
  $('[data-next]').addEventListener('click', () => { playing = false; playBtn.textContent = 'Play'; timer?.kill(); step(1, true) })
  $('[data-prev]').addEventListener('click', () => { playing = false; playBtn.textContent = 'Play'; timer?.kill(); if (k > lastIndex()) goTo(lastIndex()); else step(-1, false) })
  $('[data-replay]').addEventListener('click', () => { reset(); play() })
  boxes.forEach((b) => b.querySelector('button')!.addEventListener('click', (e) => { playing = false; playBtn.textContent = 'Play'; timer?.kill(); goTo(Number((e.currentTarget as HTMLElement).dataset.goto), true) }))
  sel.addEventListener('change', () => { run = runs.find((r) => r.id === sel.value)!; views = viewsFor(run); reset() })
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === ' ') { e.preventDefault(); play() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $<HTMLButtonElement>('[data-next]').click() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $<HTMLButtonElement>('[data-prev]').click() }
    else if (e.key === 'r' || e.key === 'R') $<HTMLButtonElement>('[data-replay]').click()
    else if (/^[1-9]$/.test(e.key)) { playing = false; timer?.kill(); playBtn.textContent = 'Play'; goTo(Number(e.key) - 1, true) }
  })

  const q = new URLSearchParams(location.search)
  if (q.get('run')) { const r = runs.find((x) => x.id === q.get('run')); if (r) { sel.value = r.id; run = r; views = viewsFor(r) } }
  reset()
  if (reduced || q.has('final')) finish(false)
  else if (q.has('step')) goTo(Number(q.get('step')) - 1)
  else if (q.has('autoplay')) play()

  // en direct : l'avancement du pipeline relu toutes les 2 s (status.json via l'app locale)
  if (live && live.status) {
    const names = ['download', 'transcribe', 'keyframes', 'storyboard', 'understand', 'register']
    const apply = (st: Record<string, unknown>) => names.forEach((n, j) => {
      const s = (st as Record<string, string>)[n]
      if (s) paintBox(j, s === 'done' ? 'done' : s === 'running' ? 'reading' : s === 'failed' ? 'failed' : 'waiting', true)
    })
    apply(live.status)
    setInterval(async () => { try { const r = await fetch('/api/state.json'); if (r.ok) apply(((await r.json()) as { status: Record<string, unknown> }).status || {}) } catch { /* reste sur le dernier état */ } }, 2000)
  }
})
