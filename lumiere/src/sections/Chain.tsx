import { Frise } from './Frise'

export function Chain() {
  return (
    <section id="chain" className="sec">
      <div className="wrap">
        <p className="catch rake engrave" data-reveal="rake">Every tool on the market starts from a fresh recording. We start from what you already filmed.</p>
        <div className="sec-head" style={{ marginTop: 40 }}>
          <p className="lede">An existing video goes in. Nine links later an agent has done the work in today’s software and the database says whether it got it right. Here is the run of 7 November, replayed link by link.</p>
        </div>
        <Frise />
        <div className="tools" data-reveal-group="mould">
          <article className="tool stamp" data-mould>
            <p className="where">Link 02, Listen</p>
            <h3>Gladia</h3>
            <p>The house rule lives in the voice, not on the screen. Gladia turns the narration into sentences with a time on each, so an aside said at 3:16 lands on the keyframe it explains, and reaches the skill.</p>
          </article>
          <article className="tool stamp" data-mould>
            <p className="where">Link 05, Read</p>
            <h3>H Models API, Holo4</h3>
            <p>Holo4 reads screens. It looks at the 2021 keyframes five at a time, with what was said over them, and writes the steps with the exact labels and fields, the exception rules, and what has probably moved since.</p>
          </article>
          <article className="tool stamp" data-mould>
            <p className="where">Links 06 and 07, Register and Run</p>
            <h3>H Agents API</h3>
            <p>The skill is registered and pinned to a revision, so a repair is a new revision and not a silent edit. The agent runs it in a real Chrome, every step streams back while it works, and each run leaves a public replay.</p>
          </article>
        </div>
      </div>
    </section>
  )
}
