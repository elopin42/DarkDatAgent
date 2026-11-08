// Suite des pages : banc, reçus de runs, dérives, démo, app locale ; puis écriture des fichiers.
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { page, source, head, facts, esc, ruleText, tc, usd, dur, paris, tagFor, ARM, frameC, D, NAME, ROOT, STEPS } from './pages.mjs'
import { out, rack, runs, old, replay } from './build-pages.mjs'

// ---------- /bench/ ----------
const trapRows = D.traps.map((t) => {
  const r = runs.find((x) => x.id === t.arms['old-voice'].run_id)
  return `<tr><th scope="row">${t.row}, ${esc(r.supplier)}</th><td>${ruleText(D.rules[t.row])}</td><td>${tagFor(r.verdict)}</td><td><a href="/runs/${r.id}/"><code>${r.id}</code></a></td></tr>`
}).join('')
const armTable = (rows) => `<div class="table-scroll" data-lamp><table class="table">
  <thead><tr><th scope="col">Arm</th><th scope="col" class="num">n</th><th scope="col" class="num">Passed</th><th scope="col" class="num">Partial</th><th scope="col" class="num">Failed</th><th scope="col" class="num">Avg steps</th><th scope="col" class="num">Avg time</th><th scope="col" class="num">Avg cost</th><th scope="col" class="num">Skill loaded</th></tr></thead>
  <tbody>${rows.map((a) => `<tr><th scope="row">${a.arm}</th><td class="num">${a.n}</td><td class="num">${a.success}</td><td class="num">${a.partial}</td><td class="num">${a.failed}</td><td class="num">${a.steps}</td><td class="num">${a.duration} s</td><td class="num">${a.cost.toFixed(2)} USD</td><td class="num">${a.skill_loaded}/${a.n}</td></tr>`).join('')}</tbody>
</table></div>`
const runRow = (r) => `<tr data-arm="${r.arm}"><th scope="row"><a href="/runs/${r.id}/"><code>${r.id}</code></a></th><td data-label="Arm">${ARM[r.arm]}</td><td class="num" data-label="Invoice">${r.row}</td><td data-label="Verdict">${tagFor(r.verdict)}</td><td class="num" data-label="Steps">${r.steps ?? 'not recorded'}</td><td class="num" data-label="Time">${r.duration} s</td><td class="num" data-label="USD">${r.cost == null ? 'not recorded' : r.cost.toFixed(2)}</td><td class="num" data-label="Skill rev.">${r.revision ?? 'none'}</td><td data-label="What happened">${esc(r.note ?? '')}</td></tr>`
out['bench'] = page({ path: '/bench/', title: 'Bench', desc: 'Same invoices, one agent per arm, every verdict read in the SQL database. A pilot.', script: 'bench', body: `
${head('<a href="/pipeline/">Pipeline</a>, steps 8 and 9', 'Bench', 'The same invoices run in the same order, with one agent per arm. <mark class="hl">The verdict comes from the SQL database</mark>, never from what the agent says about itself. A pilot, not a study.')}
    <section class="wrap section-app"><pre class="cmd"><code>python scripts/90_bench.py JZMgB1UItkk --arms none,old-voice --n 8</code></pre></section>
    <section class="wrap section-app" aria-labelledby="traps-h">
      <h2 id="traps-h" class="h2" data-crt>House-rule rows, failures first</h2>
      <p class="muted">Rows where the right answer depends on a house rule the 2021 tutorial never mentions. The task sent to the agent does not state the rule, except in the row 27 run: it predates that change and still gave the VAT rate.</p>
      <div class="table-scroll" data-lamp><table class="table"><thead><tr><th scope="col">Row</th><th scope="col">House rule</th><th scope="col">2021 tutorial</th><th scope="col">Run</th></tr></thead><tbody>${trapRows}</tbody></table></div>
      <h3 class="h3">The 2021 tutorial on these rows</h3>
      ${armTable(D.bench.traps)}
    </section>
    <section class="wrap section-app" aria-labelledby="gen-h">
      <h2 id="gen-h" class="h2" data-crt>Generic data entry, per arm</h2>
      ${armTable(D.bench.generic)}
      <p class="muted">${D.noops} runs left out of the counts: the invoice already existed before the run and the agent, told never to create a record twice, created nothing. The database confirms.</p>
    </section>
    <section class="wrap section-app" id="runs" aria-labelledby="runs-h">
      <h2 id="runs-h" class="h2" data-crt>Runs</h2>
      <p class="muted">One row of <code>report/bench.csv</code> per H session.</p>
      <div class="tabs" role="group" aria-label="Filter by arm">
        <button type="button" class="tab" aria-pressed="true" data-arm="all">All (${runs.length})</button>
        <button type="button" class="tab" aria-pressed="false" data-arm="old-voice">2021 tutorial (${old.length})</button>
        <button type="button" class="tab" aria-pressed="false" data-arm="none">No tutorial (${runs.length - old.length})</button>
      </div>
      <div class="table-scroll" data-lamp><table class="table" data-runs><thead><tr><th scope="col">Run</th><th scope="col">Arm</th><th scope="col" class="num">Invoice</th><th scope="col">Verdict</th><th scope="col" class="num">Steps</th><th scope="col" class="num">Time</th><th scope="col" class="num">USD</th><th scope="col" class="num">Skill rev.</th><th scope="col">What happened</th></tr></thead>
      <tbody>${runs.map(runRow).join('')}</tbody></table></div>
    </section>` })

// ---------- /runs/<id>/ ----------
const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : 'not recorded')
runs.forEach((r, i) => {
  const prev = runs[i - 1], next = runs[i + 1]
  out[`runs/${r.id}`] = page({ path: `/runs/${r.id}/`, title: `Invoice ${r.row}${r.supplier ? `, ${r.supplier}` : ''}, run of ${paris(r.started_at)}`, desc: `Verification receipt of run ${r.id}: what the agent says against what the database says.`, script: 'run', body: `
${head(`<a href="/bench/">Bench</a>, ${ARM[r.arm]}`, `Invoice ${r.row}${r.supplier ? `, ${esc(r.supplier)}` : ''}`, `Run ${r.id}, started at ${paris(r.started_at)} on 7 November 2026.`)}
    <div class="wrap"><p class="verdict-big">${tagFor(r.verdict)}</p></div>
    <section class="wrap section-app">
      <p class="run-nav">${prev ? `<a href="/runs/${prev.id}/">Previous run</a>` : ''}${next ? `<a href="/runs/${next.id}/">Next run</a>` : ''}${r.share_url ? `<a class="link-ext" href="https://platform.hcompany.ai/agent-view/${r.share_url.split('/').pop()}" rel="noopener" target="_blank">Replay on H (sign-in required)</a><a class="link-ext" href="${r.share_url}" rel="noopener" target="_blank">Raw trajectory (public JSON)</a>` : '<span class="muted">No H replay for this run</span>'}</p>
      <div class="receipt-grid" data-front-free>
        <article class="receipt-side" data-lamp>
          <h2 class="h3">Agent says</h2>
          <dl class="kv"><div><dt>Created</dt><dd>${yn(r.agent_created)}</dd></div><div><dt>Validated</dt><dd>${yn(r.agent_validated)}</dd></div><div><dt>Total with tax</dt><dd>${r.agent_ttc ? `${r.agent_ttc.toFixed(2)} €` : 'not given'}</dd></div></dl>
          ${r.agent_said ? `<blockquote class="said">${esc(r.agent_said)}</blockquote>` : ''}
        </article>
        <article class="receipt-side receipt-side--db" data-lamp>
          <h2 class="h3">Database says</h2>
          <dl class="kv"><div><dt>Rows</dt><dd>${r.before ?? 'not read'} before, ${r.after ?? 'not read'} after</dd></div><div><dt>Total before tax</dt><dd>${r.sql_ht != null && r.after > r.before ? `${r.sql_ht.toFixed(2)} €` : 'no invoice created by this run'}</dd></div><div><dt>Status</dt><dd>${r.sql_status === 1 && r.after > r.before ? '<code>fk_statut</code> 1, validated' : r.verdict === 'partial' ? 'draft' : 'nothing new'}</dd></div></dl>
          <p class="verdict-line">${tagFor(r.verdict)} ${esc(r.note ?? (r.verdict === 'success' ? 'the invoice is in the database, validated' : ''))}</p>
        </article>
      </div>
      ${facts([
        ['Steps', `${r.steps ?? 'not recorded'} of 40 (<code>max_steps</code>)`],
        ['Time', `${dur(r.duration)} (<code>max_time</code> 600 s)`],
        ['Cost', usd(r.cost)],
        ['Skill', r.arm === 'none' ? 'none, the control agent' : `revision ${r.revision}, loaded ${r.skill_loaded ? 'yes' : 'no'}`],
        ['Drifts noted', r.drifts ?? 0],
        ...(r.rule ? [['House rule', ruleText(D.rules[r.row])]] : []),
      ])}
    </section>` })
})

// ---------- /drift/ ----------
const EN = [
  'The tutorial creates the invoice from an approved purchase order. Here it was created directly from Billing, Supplier invoices, New invoice, a path the tutorial does not detail.',
  'The tutorial uses predefined product lines. Here a free line of type Product was typed by hand, a function the video never shows.',
  'Creating it directly from the Billing menu is not covered by the tutorial.',
  'The path used was Billing and payment, Supplier invoices, New invoice, because the task names no purchase order, while the tutorial starts from an approved order.',
]
const refilm = [D.shots.find((s) => s.t >= 54) , D.shots.find((s) => s.t >= 85), D.shots.find((s) => s.t >= 142)].filter(Boolean)
out['drift'] = page({ path: '/drift/', title: 'Drift report', desc: 'Where the agent had to leave the 2021 tutorial, noted by the agent itself.', body: `
${head('<a href="/bench/">Bench</a>, 2021 tutorial arm', 'Drift report', 'Every time the agent had to leave a step of the skill, <mark class="hl">it noted it</mark>. Deduplicated, most frequent first. This weekend every note is a gap of coverage, the video shows another path, and none is a renamed or moved button.')}
    <section class="wrap section-app">
      ${facts([
        ['Drifts noted', `${D.drift.length}, each seen in 1 run of ${D.drift[0]?.of ?? 11}`],
        ['Runs passed anyway', `${old.filter((r) => r.verdict === 'success').length} of ${old.filter((r) => r.verdict !== 'noop').length}, verdict read in SQL`],
        ['Tutorial age', '5 years, 5 February 2021, never re-recorded'],
      ])}
      <div class="table-scroll" data-lamp><table class="table"><thead><tr><th scope="col">Where the agent left the video</th><th scope="col">As the agent wrote it</th><th scope="col" class="num">Seen</th></tr></thead>
      <tbody>${D.drift.map((d, i) => `<tr><th scope="row"><span class="cell-measure">${esc(EN[i] ?? '')}</span></th><td lang="fr"><span class="cell-measure">${esc(d.fr)}</span></td><td class="num">${d.seen} of ${d.of}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="wrap section-app">
      <h2 class="h2" data-crt>Where the video and the task part ways</h2>
      <p class="muted">The moments of the video these notes point to.</p>
      <ol class="shots shots--3">${refilm.map((s) => `<li class="shot"><figure><div class="shot__img ray"><img src="${frameC(s.n)}" alt="Keyframe ${s.n} at ${tc(s.t)}" width="480" height="300" loading="lazy" /></div><figcaption><span class="mono">${tc(s.t)}</span> <code>${s.file}</code></figcaption></figure><p lang="fr">“${esc(s.said)}”</p></li>`).join('')}</ol>
    </section>` })

export { out }
