// La démo /board/, l'app locale (/start/, /welcome/, /setup/, /new/, /projects/<id>/), puis l'écriture des fichiers.
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { page, source, head, facts, esc, tc, D, NAME, ROOT, STEPS } from './pages.mjs'
import { rack, runs, replay } from './build-pages.mjs'
import { out } from './build-pages-2.mjs'

// ---------- /board/ : la démo ----------
out['board'] = page({ path: '/board/', title: 'Demo board', desc: 'Each agent of the chain, what it reads and what it produces, replayed from the run of 7 November 2026 or live from the local app.', script: 'board', bodyClass: 'board-page', body: `
    <div class="wrap page__head page__head--board">
      <div class="board-head">
        <h1 class="page__title">Demo board</h1>
        <p class="page__lede">Nine steps, from a video filmed in 2021 to an invoice checked in the database. The box in amber is reading, the sheet out of a box is what it produced.</p>
      </div>
      ${source()}
    </div>
    <section class="wrap board-wrap" aria-label="The chain">
      <div class="board" data-board>
        <div class="board__bar" data-front-free>
          <label class="field field--inline">Run
            <select data-run-select>
              <option value="JZMgB1UItkk-skill-1-1107-192947">Row 1, Papeterie Nord, revision 2, success</option>
              <option value="JZMgB1UItkk-none-2-1107-153235">Row 2, no tutorial, success</option>
              <option value="JZMgB1UItkk-skill-3-1107-195711">Row 3, Transports Lemaire, rule not in the skill, success</option>
              <option value="JZMgB1UItkk-skill-27-1107-164022">Row 27, Café du Coin, date refused, fail</option>
            </select>
          </label>
          <div class="board__ctrl" role="group" aria-label="Replay controls" data-front-free>
            <button class="btn btn--small" type="button" data-prev aria-keyshortcuts="ArrowLeft">Previous</button>
            <button class="btn btn--amber btn--small" type="button" data-play aria-keyshortcuts="Space">Play</button>
            <button class="btn btn--small" type="button" data-next aria-keyshortcuts="ArrowRight">Next</button>
            <button class="btn btn--small" type="button" data-replay aria-keyshortcuts="R">Replay</button>
          </div>
        </div>
        <p class="board__status mono" data-board-status aria-live="polite">Replay of 7 November 2026, step 0 of 9. Press Play or Space.</p>
        <ol class="rack" data-rack data-front-free>
${STEPS.map((s, i) => `          <li class="box"><span class="box__img" aria-hidden="true"><span class="box__num"><span class="box__n">${String(i + 1).padStart(2, '0')}</span>${s.verb}</span><span class="box__sheet"></span><span class="box__meter"></span></span><span class="box__label"><span class="box__verb">${s.verb}</span><span class="box__tool">${esc(s.tool)}</span></span><span class="box__state">waiting</span><button type="button" aria-label="Go to step ${i + 1}, ${s.verb}, ${esc(s.tool)}" data-goto="${i}"></button></li>`).join('\n')}
        </ol>
        <div class="reader" data-reader data-front-free>
          <div class="reader__col"><p class="reader__h mono" data-reader-in-h>In</p><div class="reader__body" data-reader-in><p>Choose a run and press Play. Each step shows what it reads here.</p></div></div>
          <div class="reader__col"><p class="reader__h mono" data-reader-out-h>Out</p><div class="reader__body" data-reader-out><p>And what it produces here.</p></div></div>
        </div>
      </div>
      <div class="desk" data-front-free>
        <section class="pane"><h2 class="pane__h">Tutorial at this moment <span class="mono" data-t-now>0:00</span></h2><div class="pane__img"><img data-t-frame src="/frames-c/035.jpg" width="480" height="300" alt="Keyframe of the 2021 tutorial at the current moment" /></div><p class="pane__quote" lang="fr" data-t-quote>The 2021 tutorial, keyframe 35 of 106. Press Play to follow the run.</p></section>
        <section class="pane"><h2 class="pane__h">Skill <span class="mono" data-s-rev>tuto-JZMgB1UItkk-old-voice</span></h2><ol class="steps steps--live" data-s-steps></ol></section>
        <section class="pane"><h2 class="pane__h">Agent <span class="mono" data-a-counters>0 steps, 0 s</span></h2><div data-a-body><p class="muted">Waiting for step 7.</p></div></section>
        <section class="pane"><h2 class="pane__h">SQL database <code>llx_facture_fourn</code></h2><div data-q-body><p class="muted">Read after the run, at step 8.</p></div></section>
      </div>
      <p class="muted board__keys">Keyboard: Space plays or pauses, the arrows move one step, 1 to 9 go to a step, R replays.</p>
    </section>` })

// ---------- app locale ----------
const localNote = `<p class="notice" data-local-note role="status" data-front-free>These pages save on the computer that runs the local app (<code>make run</code>, then <code>http://localhost:8000/start/</code>). It does not answer here, so the buttons are off. Start it with make run.</p>`
out['welcome'] = page({ path: '/welcome/', title: 'Welcome', local: true, desc: 'Turn a tutorial video into an agent, on your computer.', script: 'local', body: `
${head('', 'Turn a tutorial video into an agent.', 'Give it a how-to video, even an old one. It reads the screen, listens to the voice, writes the procedure, and an agent does the task in your software.', false)}
    <section class="wrap section-app">
      <ol class="steps steps--big">
        <li><strong>Connect two accounts.</strong> Gladia for the voice, H Company to understand the tutorial and run the agent. Two keys to paste.</li>
        <li><strong>Add a video.</strong> A file on this computer or a YouTube link.</li>
        <li><strong>Pick the software</strong> the agent will work in, and press Start.</li>
      </ol>
      <p><a class="btn btn--amber" href="/setup/">Connect your accounts</a></p>
      <h2 class="h2">What happens on your computer</h2>
      <p class="prose">Everything runs on your computer. The video file goes to Gladia, which transcribes the voice. The keyframes and sentences go to H Company, which writes the procedure and runs the agent. The first video takes a few minutes: download, transcription, keyframes, storyboard. You can follow each step as it runs.</p>
    </section>` })
const keyField = (id, label, use, where, url) => `<fieldset class="fieldset"><legend>${label}</legend><p>${use}</p><ol><li><a href="${url}" target="_blank" rel="noopener">Open ${label}</a> (${where}), sign in and create a key.</li><li><label for="${id}">Paste the key</label><input class="input" type="password" id="${id}" name="${id}" spellcheck="false" autocomplete="off" /></li></ol><p class="muted" data-key-state="${id}">Not checked. Start the local app with make run to check it.</p></fieldset>`
out['setup'] = page({ path: '/setup/', title: 'Connect your accounts', local: true, desc: 'Paste the Gladia and H Company keys, saved on this computer only.', script: 'local', body: `
${head('<a href="/welcome/">Welcome</a>, step 1 of 2', 'Connect your accounts', 'Gladia listens to the video, H Company understands it, writes the procedure and runs the agent. For each one: open its page, create a key, paste it here.', false)}
    <section class="wrap section-app">${localNote}
      <form class="form" method="post" action="/setup/" autocomplete="off" data-local-form>
        ${keyField('GLADIA_API_KEY', 'Gladia', 'Transcribes the tutorial voice (step 2).', 'app.gladia.io, API keys', 'https://app.gladia.io/')}
        ${keyField('HAI_API_KEY', 'H Company', 'Understands the tutorial and writes the skill (Models API, step 5), then runs the agent (Agents API, steps 6 and 7).', 'platform.hcompany.ai, Settings, API keys', 'https://platform.hcompany.ai/settings/api-keys')}
        <p><button class="btn btn--amber" type="submit" name="action" value="check" data-local-submit>Connect</button></p>
      </form>
      <p class="muted">Keys are saved in <code>.env</code> on this computer only, readable by your user, never shown again.</p>
    </section>` })
out['new'] = page({ path: '/new/', title: 'Add a video', local: true, desc: 'The tutorial video and the software the agent will work in.', script: 'local', body: `
${head('<a href="/welcome/">Welcome</a>, <a href="/setup/">step 1</a>, step 2 of 2', 'Add a video', 'The tutorial video, and the software the agent will do the task in. Then press Start.', false)}
    <section class="wrap section-app">${localNote}
      <form class="form" method="post" action="/new/" enctype="multipart/form-data" data-local-form>
        <fieldset class="fieldset"><legend>The tutorial video</legend>
          <p><label for="video-file">A video file on this computer</label><input class="input" type="file" id="video-file" name="video" accept="video/*" /></p>
          <p><label for="video-url">or a YouTube link</label><input class="input" type="url" id="video-url" name="url" placeholder="https://www.youtube.com/watch?v=JZMgB1UItkk" /></p>
          <p><label for="lang">Language spoken in the video</label><select class="input" id="lang" name="lang"><option value="fr">French</option><option value="en">English</option></select></p>
          <p class="check"><input type="checkbox" id="recent" name="recent" value="1" /><label for="recent">This is a recent recording of a task an older tutorial already shows (the bench compares the two skills)</label></p>
        </fieldset>
        <fieldset class="fieldset"><legend>The software the agent will use</legend>
          <p class="check"><input type="radio" id="sw-demo" name="software" value="demo" checked /><label for="sw-demo">Dolibarr 22, the demo in Docker on <code>localhost:8080</code></label></p>
        </fieldset>
        <p><button class="btn btn--amber" type="submit" data-local-submit>Start</button></p>
      </form>
    </section>` })
const P = D.video.id
out['start'] = page({ path: '/start/', title: 'Your videos', local: true, desc: 'The videos turned into procedures and agents on this computer.', script: 'local', body: `
${head('', 'Your videos', 'Each video becomes a procedure, then an agent. Open one to follow its progress.')}
    <section class="wrap section-app">
      <p><a class="btn btn--amber" href="/new/">Add a video</a></p>
      <div class="table-scroll" data-lamp><table class="table"><thead><tr><th scope="col">Video</th><th scope="col">Software</th><th scope="col">State</th></tr></thead>
      <tbody><tr><th scope="row"><a href="/projects/${P}/">YouTube ${P}</a></th><td>Dolibarr 22</td><td>agent ready, ${runs.length} runs</td></tr></tbody></table></div>
      <h2 class="h2">Accounts</h2>
      <ul class="plain"><li>Gladia: not checked. Start the local app with make run to check it.</li><li>H Company: not checked. Start the local app with make run to check it.</li></ul>
      <p><a href="/setup/">Change accounts</a></p>
    </section>` })
const pstates = ['done', 'unknown', 'done', 'unknown', 'unknown', 'done', 'done', 'done', 'skipped']
out[`projects/${P}`] = page({ path: `/projects/${P}/`, title: `Video ${P}`, local: true, desc: 'The progress of one video through the chain.', script: 'local', body: `
${head('<a href="/start/">Your videos</a>', `YouTube ${P}`, `${esc(D.video.title)}, 5 February 2021, 7:00. Dolibarr 22 as the software.`)}
    <section class="wrap section-app">
      <div class="board board--static">${rack(true, pstates)}</div>
      <p class="muted">“No file here” means the file of that step (the transcript, the storyboard, the skill file) is not in the copy of the work folder this page was built from. The local app shows its real state and refreshes every 3 s.</p>
      ${facts([
        ['Keyframes', `<a href="/storyboard/">${D.video.frames} images</a>`],
        ['Skill', '<a href="/skills/old-voice/"><code>tuto-JZMgB1UItkk-old-voice</code></a>, revision 2'],
        ['Runs', `<a href="/bench/">${runs.length} on the bench</a>, last verified: <a href="/runs/${replay.id}/">row 3, ${replay.verdict}</a>`],
      ])}
      <h2 class="h2">Storyboard, a few frames</h2>
      <ol class="shots shots--3">${D.shots.slice(30, 36).map((s) => `<li class="shot"><figure><div class="shot__img"><img src="/frames-c/${String(s.n).padStart(3, '0')}.jpg" alt="Keyframe ${s.n} at ${tc(s.t)}" width="480" height="300" loading="lazy" /></div><figcaption><span class="mono">${tc(s.t)}</span></figcaption></figure><p lang="fr">${s.said ? `“${esc(s.said)}”` : ''}</p></li>`).join('')}</ol>
    </section>` })

// ---------- écriture : chaque route devient <route>/index.html ----------
const list = []
for (const [route, html] of Object.entries(out)) {
  const dir = join(ROOT, route)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
  list.push(`${route}/index.html`)
}
writeFileSync(join(ROOT, 'tools/pages.json'), JSON.stringify(list, null, 1))
console.log(`${list.length} pages`)
