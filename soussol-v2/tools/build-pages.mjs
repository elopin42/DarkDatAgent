// Les pages de l'app, une par route de atelier/urls.py. Voir pages.mjs pour la mise en page commune.
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { page, source, head, facts, esc, ruleText, tc, usd, dur, paris, tagFor, ARM, frameC, D, NAME, ROOT, STEPS, VOICE_STEPS } from './pages.mjs'

const out = {}
const runs = D.runs
const old = runs.filter((r) => r.arm === 'old-voice')
const oldCounted = old.filter((r) => r.verdict !== 'noop')
const totalCost = runs.reduce((a, r) => a + (r.cost || 0), 0)
const replay = runs.find((r) => r.id === 'JZMgB1UItkk-skill-3-1107-195711')
const GLADIA = D.voice_source !== 'captions'
const VOICE_LINES = `${D.voice.length} ${GLADIA ? 'sentences transcribed by Gladia' : 'caption lines of the video'}`

// le rayonnage en lecture seule : chaque boîte rentrée avec la feuille de sa sortie réelle
const SHEETS = ['7:00 video', 'voice, timed', `${D.video.frames} frames`, 'paired', 'steps, rules', 'rev 2', `${replay.steps} steps`, replay.verdict, 'not run']
const rack = (small = false, states = null) => `<ol class="rack rack--static${small ? ' rack--small' : ''}" data-front-free>
${STEPS.map((s, i) => {
  const st = states ? states[i] : (s.verb === 'Repair' ? 'skipped' : 'done')
  return `  <li class="box is-${st}"><span class="box__img" aria-hidden="true"><span class="box__num"><span class="box__n">${String(i + 1).padStart(2, '0')}</span>${s.verb}</span><span class="box__sheet">${st === 'done' ? esc(SHEETS[i]) : ''}</span></span><span class="box__label"><span class="box__verb">${s.verb}</span><span class="box__tool">${esc(s.tool)}</span></span><span class="box__state">${st === 'done' ? (i === 6 ? `done, ${replay.duration} s` : 'done') : st === 'unknown' ? 'no file here' : st === 'skipped' ? 'not run' : st}</span></li>`
}).join('\n')}
</ol>`

// ---------- /pipeline/ ----------
out['pipeline'] = page({ path: '/pipeline/', title: 'Pipeline', desc: 'Nine scripts, one per step, from the 2021 video to a verified agent run.', body: `
${head('', 'Pipeline', 'Nine scripts, one per step. Each reads the previous one’s file and writes its own to <code>work/</code>, so <mark class="hl">only the one that crashed gets rerun</mark>.')}
    <section class="wrap section-app">
      ${facts([
        ['Source video', `5 February 2021, 7:00, <code>${D.video.id}</code>`],
        ['Storyboard', `${D.video.frames} keyframes, ${VOICE_LINES}`],
        ['H sessions', `${runs.length} runs in <code>report/bench.csv</code>`],
        ['Bench cost', `${totalCost.toFixed(2)} USD over the runs that recorded a cost`],
      ])}
    </section>
    <section class="wrap section-app" aria-labelledby="rack-h">
      <h2 id="rack-h" class="h2" data-crt>The chain, after the run of 7 November</h2>
      <div class="board board--static">${rack()}</div>
    </section>
    <section class="wrap section-app" aria-labelledby="steps-h">
      <h2 id="steps-h" class="h2" data-crt>The steps</h2>
      <div class="table-scroll" data-lamp><table class="table">
        <thead><tr><th scope="col">No.</th><th scope="col">What</th><th scope="col">Who acts</th><th scope="col">Script</th><th scope="col">Output</th><th scope="col">State</th></tr></thead>
        <tbody>${STEPS.map((s, i) => `<tr><td class="num">${String(i + 1).padStart(2, '0')}</td><th scope="row">${s.verb}, ${esc(s.how)}</th><td>${esc(s.tool)}</td><td><code>${esc(s.script)}</code></td><td><code>${esc(s.out)}</code></td><td>${s.verb === 'Repair' ? 'built, not run' : 'done'}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>` })

// ---------- /storyboard/ ----------
out['storyboard'] = page({ path: '/storyboard/', title: 'Storyboard', desc: 'The 106 keyframes of the 2021 tutorial, each with what the voice says over it.', script: 'storyboard', body: `
${head('<a href="/pipeline/">Pipeline</a>, steps 1 to 4', 'Storyboard', 'Each keyframe of the 2021 tutorial with the sentence spoken while it is on screen. This is <mark class="hl">what the model reads</mark> to write the skill.')}
    <section class="wrap section-app">
      ${facts([
        ['Video', `${esc(D.video.title)}, <a href="${D.video.url}" rel="noopener" target="_blank">YouTube</a>`],
        ['Channel', `${esc(D.video.channel)}, ${D.video.license}`],
        ['Published', '5 February 2021, 7:00'],
        ['Voice', GLADIA ? `${D.voice.length} sentences in French, transcribed by Gladia (solaria-3) with their timestamps.` : `${D.voice.length} caption lines in French, from the video itself. The Gladia transcript is not in this snapshot.`],
        ['Keyframes', `${D.video.frames} images, cut by ffmpeg at each change of screen`],
      ])}
      <div class="tabs" role="group" aria-label="What the model reads">
        <button type="button" class="tab" aria-pressed="true" data-mode="voice">Voice and images</button>
        <button type="button" class="tab" aria-pressed="false" data-mode="images">Images only</button>
      </div>
      <ol class="shots" data-shots>
${D.shots.map((s) => `        <li class="shot" id="frame-${s.n}"><figure><div class="shot__img ray"><img src="${frameC(s.n)}" alt="Keyframe ${s.n} at ${tc(s.t)}" width="480" height="300" loading="lazy" decoding="async" /></div><figcaption><span class="mono">${tc(s.t)}</span> <code>${s.file}</code></figcaption></figure><p class="shot__said" lang="fr">${s.said ? `“${esc(s.said)}”` : '<span class="muted">Nothing said yet</span>'}</p><p class="shot__none">No narration: the model only sees the image.</p></li>`).join('\n')}
      </ol>
    </section>` })

// ---------- /skills/ et /skills/old-voice/ ----------
const skillBody = (path) => `
${head('<a href="/pipeline/">Pipeline</a>, steps 5 and 6', 'Induced skills', 'The procedure Holo4 writes from the storyboard. It is reviewed for format only and <mark class="hl">never corrected on substance</mark>, otherwise the bench would stop measuring the induction.')}
    <section class="wrap section-app">
      <div class="tabs" role="group" aria-label="Skill"><a class="tab" href="/skills/old-voice/" aria-current="${path.includes('old-voice') || path === '/skills/' ? 'page' : 'false'}">2021 tutorial, old voice</a></div>
      ${facts([
        ['Skill', '<code>tuto-JZMgB1UItkk-old-voice</code>, revisions 1 and 2 on the bench'],
        ['Agent', '<code>clerk-JZMgB1UItkk-old-voice</code>, and the control <code>clerk-none-JZMgB1UItkk</code> without a skill'],
        ['Model', '<code>holo4-27b</code> on the H Models API'],
        ['Source', '2021 Dolibarr tutorial, 5 February 2021'],
        ['On the bench', `${oldCounted.filter((r) => r.verdict === 'success').length} invoices completed of ${oldCounted.length}, <a href="/bench/">bench</a>`],
        ['Drift', `${D.drift.length} notes from the runs, <a href="/drift/">drift report</a>`],
      ])}
    </section>
    <section class="wrap section-app skill-doc">
      <h2 class="h2" data-crt>Steps, as the 2021 voice dictates them</h2>
      <p class="muted">The skill file itself, <code>SKILL.old-voice.md</code>, stays in the work folder. This outline is built from the timestamped voice of the video. In the local app, the page of the video shows the full skill and a link to download it.</p>
      <ol class="steps steps--doc">${VOICE_STEPS.map((s) => `<li><strong>${esc(s.step)}</strong><span class="mono muted">${tc(s.t)} in the video</span><span lang="fr" class="muted">“${esc(s.quote)}”</span></li>`).join('')}</ol>
      <h2 class="h2">House rules tested by the bench</h2>
      <p class="muted">Not in this skill: the 2021 video never states them. The bench tests them on rows where the task never gives them; the internal video is the one meant to carry them.</p>
      <ul class="rules">${Object.entries(D.rules).map(([row, r]) => `<li><span class="mono">row ${row}, ${esc(r.rule)}</span> ${ruleText(r)}</li>`).join('')}</ul>
      <h2 class="h2">Final check</h2>
      <p>Every run is read in the supplier invoice table of Dolibarr by step 8. The verdict comes from SQL, never from the agent.</p>
    </section>`
out['skills'] = page({ path: '/skills/', title: 'Induced skills', desc: 'The skill Holo4 writes from the 2021 tutorial, its steps and the rules the video states.', body: skillBody('/skills/') })
out['skills/old-voice'] = page({ path: '/skills/old-voice/', title: 'Skill, 2021 tutorial', desc: 'The skill induced from the 2021 Dolibarr tutorial.', body: skillBody('/skills/old-voice/') })

export { out, rack, runs, old, replay, SHEETS }
