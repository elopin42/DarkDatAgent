// Écrit les pages de l'app aux mêmes adresses que les routes Django (atelier/urls.py), en HTML statique rendu depuis
// src/data/app.json (le relevé du 7 novembre). Le JS ne fait qu'ajouter : source en direct, rejeu, filtres, gestes.
// Lancé avant `vite` et `vite build` (predev, prebuild).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const D = JSON.parse(readFileSync(join(ROOT, 'src/data/app.json'), 'utf8'))
const NAME = 'DarkDatAgent'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const tc = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const usd = (n) => (n == null ? 'not recorded' : `${n.toFixed(2)} USD`)
const dur = (s) => (s == null ? 'not recorded' : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`)
const paris = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
const VERDICT = { success: 'success', partial: 'partial', fail: 'fail', noop: 'nothing created', crash: 'crash' }
const tagFor = (v) => `<span class="tag ${v === 'success' ? 'tag--ink' : v === 'noop' ? 'tag--line' : 'tag--fail'}">${esc(VERDICT[v] ?? v)}</span>`
const ARM = { none: 'No tutorial', 'old-voice': '2021 tutorial' }
const frameC = (n) => `/frames-c/${String(n).padStart(3, '0')}.jpg`

export const STEPS = [
  { verb: 'Fetch', tool: 'yt-dlp', script: '10_download.sh', out: 'data/videos/<id>.mp4', how: 'downloads the public video' },
  { verb: 'Listen', tool: 'Gladia', script: '20_transcribe.py', out: 'transcript.json', how: 'the voice as sentences with timestamps' },
  { verb: 'Cut', tool: 'ffmpeg', script: '30_keyframes.py', out: 'frames/*.jpg', how: 'a keyframe each time the screen changes' },
  { verb: 'Pair', tool: 'local script', script: '40_storyboard.py', out: 'storyboard.json', how: 'each sentence on its keyframe' },
  { verb: 'Read', tool: 'Holo4, H Models API', script: '50_induce.py', out: 'SKILL.<variant>.md', how: 'steps, fields and rules from frames and voice' },
  { verb: 'Register', tool: 'H Agents API', script: '60_register.py', out: 'agent.json', how: 'pins the skill revision, creates the two agents' },
  { verb: 'Run', tool: 'H agent in Chrome', script: '70_run_one.py', out: 'work/runs/<run_id>.json', how: 'the agent does the task in Dolibarr' },
  { verb: 'Verify', tool: 'SQL read', script: '80_verify.py', out: 'verdict in the run', how: 'what the database says, not the agent' },
  { verb: 'Repair', tool: 'local script', script: '75_repair.py', out: 'repairs.json', how: 'the next revision of the skill from the drifts' },
]
// Les étapes que la voix de 2021 dicte, horodatées dans les sous-titres réels (même liste que src/chain.ts).
export const VOICE_STEPS = [
  { t: 85.41, quote: 'à partir du menu factures fournisseurs', step: 'Open Supplier invoices, New invoice' },
  { t: 90.59, quote: 'choisir le fournisseur pour lequel vous créez la facture', step: 'Pick the supplier' },
  { t: 121.82, quote: 'choisissez la date de la facture', step: 'Set the invoice date' },
  { t: 142.29, quote: 'vous pouvez ajouter des produits et des services', step: 'Add the lines, price before tax, VAT' },
  { t: 176.54, quote: 'cliquez sur valider', step: 'Validate' },
]

const NAV = [
  ['/pipeline/', 'Pipeline'], ['/storyboard/', 'Storyboard'], ['/skills/', 'Skills'], ['/bench/', 'Bench'], ['/drift/', 'Drift'],
]
function page({ path, title, desc, body, script = 'app', bodyClass = '', local = false }) {
  const cur = (href) => (path.startsWith(href) ? ' aria-current="page"' : '')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}, ${NAME}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta property="og:title" content="${esc(title)}, ${NAME}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:type" content="website" />
  <meta name="robots" content="${local ? 'noindex' : 'index, follow'}" />
  <meta name="theme-color" content="#edebe7" />
  <link rel="icon" href="/brand/darkdatagent-mark.svg" type="image/svg+xml" />
  <link rel="preload" href="/fonts/hanken-grotesk-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />
</head>
<body class="app ${bodyClass}">
  <header class="nav is-light" data-nav data-front-free>
    <a class="skip" href="#main">Skip to the content</a>
    <a class="sign" href="/" aria-label="${NAME}, home">
      <img class="sign__mark" src="/brand/darkdatagent-mark.svg" width="32" height="32" alt="" />
      <span class="site-name">${NAME}</span>
    </a>
    <nav class="nav__links" aria-label="Application" data-front-free>
      ${NAV.map(([h, l]) => `<a href="${h}"${cur(h)}>${l}</a>`).join('\n      ')}
      <a class="nav__cta" href="/board/"${cur('/board/')}>Open the board</a>
    </nav>
  </header>
  <main id="main" class="page">
${body}
  </main>
  <footer class="footer footer--app">
    <div class="wrap footer__grid">
      <p class="footer__name"><img class="footer__badge" src="/brand/darkdatagent-badge.svg" width="96" height="96" alt="DarkDatAgent badge: a dark mass of data crossed by an orbit, with the agent as a cursor block" /><span class="site-name">${NAME}</span></p>
      <p class="footer__credits">${local ? 'Local app. Everything runs on this computer. Videos and results stay in <code>data/</code> and <code>work/</code>, nothing leaves it except the calls to Gladia and H Company.' : 'Built on 7 and 8 November 2026 at the H Company × 42AI hackathon, Paris. Gladia for the voice, ffmpeg for the keyframes, H Company Models API to write the skill and Agents API to run it, Dolibarr 22 in Docker as the target, SQL to check. Videos by the Dolibarr association, Creative Commons Attribution. Code under the MIT license.'}</p>
      <nav class="footer__links" aria-label="Application pages">
        <a href="/board/">Board</a><a href="/pipeline/">Pipeline</a><a href="/bench/">Bench</a><a href="/start/">Run it locally</a>
      </nav>
    </div>
  </footer>
  <script type="module" src="/src/${script}.ts"></script>
</body>
</html>
`
}
const source = (extra = '') => `<p class="source" data-source aria-live="polite">Replay of 7 November 2026, read from report and work${extra}</p>`
const head = (crumbs, h1, lede, chip = true) => `    <div class="wrap page__head">
      ${crumbs ? `<p class="crumbs">${crumbs}</p>` : ''}
      <h1 class="page__title" data-crt>${h1}</h1>
      ${lede ? `<p class="page__lede">${lede}</p>` : ''}
      ${chip ? source() : ''}
    </div>`
const facts = (rows) => `<dl class="facts" data-front-free>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`

export { page, source, head, facts, esc, tc, usd, dur, paris, tagFor, ARM, frameC, D, NAME, ROOT, VERDICT }
