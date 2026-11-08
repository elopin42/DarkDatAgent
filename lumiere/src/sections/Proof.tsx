import { TRAPPED, BENCH, DRIFT } from '../data/content'

export function Proof() {
  return (
    <section id="proof" className="sec">
      <div className="wrap">
        <div className="sec-head">
          <h2 className="rake engrave" data-reveal="rake">The invoices that depend on a house rule.</h2>
          <p className="lede">These are the ones a generic assistant gets wrong. Verdicts come from a SQL read of the database, not from the agent. Pilot, indicative.</p>
        </div>
        <div className="rows" data-reveal-group="groove">
          <div className="row label" aria-hidden="true"><span>invoice</span><span>supplier</span><span>house rule</span><span>what happened</span><span>verdict</span><i className="groove" /></div>
          {TRAPPED.map((r) => (
            <div key={r.row} className={`row ${r.verdict === 'fail' ? 'fail' : 'ok'}`}>
              <span className="mono">{r.row}</span>
              <span>{r.supplier}</span>
              <span className="rule">{r.rule}</span>
              <span>{r.reason} <span className="note mono">{r.steps} steps, {r.duration} s</span></span>
              <span className="v">{r.verdict}</span>
              <i className="groove" aria-hidden="true" />
            </div>
          ))}
        </div>

        <div className="bench">
          <div>
            <h3 className="rake engrave" data-reveal="rake">All invoices, the weekend’s pilot.</h3>
            <p style={{ marginTop: 16 }}>The same invoices for both arms, each checked in the database. Four runs are left out of the counts: the invoice already existed and the agent, told never to create a record twice, created nothing. The database confirms.</p>
            <p className="note" style={{ marginTop: 12 }}>One run where the agent said it created the invoice and the database says otherwise. This is a pilot, not a study.</p>
          </div>
          <div className="stamp stamp-1 bench-table">
            <table>
              <thead><tr><th>arm</th><th className="num">completed</th><th className="num">partial</th><th className="num">failed</th><th className="num">steps</th><th className="num">cost</th></tr></thead>
              <tbody>
                {BENCH.map((b) => (
                  <tr key={b.arm}><th scope="row">{b.arm}</th><td className="num">{b.success} of {b.n}</td><td className="num">{b.partial}</td><td className="num">{b.failed}</td><td className="num">{b.steps}</td><td className="num">{b.cost} USD</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="drift-head">
          <h3 className="rake engrave" data-reveal="rake">Where the 2021 tutorial is out of date.</h3>
          <p>The agent notes every time the screen no longer matches the tutorial. Each note below was seen in 1 run of 11. The repair step folds them into the next revision of the skill: revision 1 became revision 2, and the duplicate supplier row passed on revision 2.</p>
        </div>
        <div className="drift" data-reveal-group="mould" data-depth="1">
          {DRIFT.map((d, i) => (
            <div className="d stamp stamp-1" key={i} data-mould>
              <p><span className="label">2021</span> {d.was}</p>
              <p><span className="label">2026</span> {d.now}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
