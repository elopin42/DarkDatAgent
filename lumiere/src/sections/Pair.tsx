import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger, reduced } from '../clock'
import { RUN, REPLAY_URL } from '../data/content'
import { ExtIcon } from '../ui'

export function Pair() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reduced) return
    const band = ref.current!.querySelector('.pair-band')!
    gsap.set(band, { '--rake': -0.2 })
    const st = ScrollTrigger.create({ trigger: ref.current!, start: 'top 55%', once: true, onEnter: () => { gsap.to(band, { '--rake': 1.2, duration: 0.9, ease: 'power2.inOut' }) } })
    return () => st.kill()
  }, [])
  return (
    <section id="pair" className="sec">
      <div className="wrap">
        <div className="sec-head">
          <h2 className="rake engrave" data-reveal="rake">Filmed for people in 2021. Done by an agent in 2026.</h2>
          <p className="lede">The tutorial shows the new supplier invoice form in Dolibarr. Five years and several releases later, the agent fills the same form, and the database keeps the row.</p>
        </div>
        <div className="pair" ref={ref} data-reveal-group="mould">
          <figure className="card stamp" data-mould>
            <img src="/img/tutorial-2021-0136.webp" width={1280} height={800} alt="Keyframe at 1:36 of the 2021 Dolibarr tutorial: the new supplier invoice form, with supplier, type, dates and payment terms." loading="lazy" />
            <figcaption><span>Dolibarr tutorial, 1:36</span><span className="mono">5 Feb 2021</span></figcaption>
          </figure>
          <div className="receipt stamp" data-mould>
            <p className="label">What the database says, 7 Nov 2026</p>
            <h3>Invoice {RUN.row}, {RUN.supplier}</h3>
            <dl>
              <dt>rows before</dt><dd>{RUN.rowsBefore}</dd>
              <dt>rows after</dt><dd>{RUN.rowsAfter}</dd>
              <dt>total before tax</dt><dd>{RUN.totalHT}</dd>
              <dt>total with tax</dt><dd>{RUN.totalTTC}</dd>
              <dt>agent steps</dt><dd>{RUN.steps}</dd>
              <dt>duration</dt><dd>{RUN.duration} s</dd>
              <dt>cost</dt><dd>{RUN.cost.toFixed(2)} USD</dd>
            </dl>
            <div className="verdict"><span className="label">SQL read of llx_facture_fourn</span><b>{RUN.verdict}</b></div>
            <a className="btn stamp" href={REPLAY_URL} rel="noopener noreferrer">Watch this run on H <ExtIcon /></a>
          </div>
          <div className="pair-band" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
