import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger, reduced } from '../clock'
import { COMPARE, SITE_NAME } from '../data/content'
import { Sign } from '../ui'

export function Difference() {
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (reduced) return
    const el = ref.current!
    gsap.set(el, { '--d': '0px' })
    const st = ScrollTrigger.create({ trigger: el, start: 'top 75%', once: true, onEnter: () => { gsap.to(el, { '--d': '2px', duration: 0.6, ease: 'power2.out' }) } })
    return () => st.kill()
  }, [])
  return (
    <section id="difference" className="sec">
      <div className="wrap">
        <div className="sec-head">
          <h2 className="rake engrave" data-reveal="rake">Others record. We read the archive.</h2>
          <p className="lede">We don’t claim to have invented learning from demonstration. We claim it shouldn’t require a new demonstration.</p>
        </div>
        <div className="compare">
          <table>
            <thead><tr><th></th><th>input</th><th>output</th><th>runs the task</th></tr></thead>
            <tbody>
              {COMPARE.map((c) => (
                <tr key={c.who} className={c.ours ? 'ours' : ''} ref={c.ours ? ref : undefined}>
                  <th scope="row">{c.who}</th><td>{c.input}</td><td>{c.output}</td><td>{c.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note prior">Prior work we build on and cite: Scribe, Guidde and Trupeer turn existing videos into documentation, not agents. Resource2Skill (Microsoft, 2026) distils public tutorials into skills. TimeWarp (arXiv 2603.04949). None of them connects an organisation’s own archive to executable skills that carry its rules and are checked in its database.</p>
      </div>
    </section>
  )
}

export function Next() {
  return (
    <section id="next" className="sec sec-next">
      <div className="wrap">
        <h2 className="rake engrave" data-reveal="rake">What comes next, if it holds.</h2>
        <div className="next">
          <p>Software vendors have libraries of tutorials. The agent tells them when a video is no longer enough, so they know which step to re-film.</p>
          <p>Small businesses that run on software without an API have internal Looms and recorded trainings. Same pipeline, with your rules written down once.</p>
          <p>Accounting firms and non-profits that re-key the same documents: the video of whoever does it best becomes the agent of everyone else.</p>
          <p>Not built yet: finding the right tutorial from a task description, and an agent that stops and asks a person when a rule from the video is ambiguous instead of guessing.</p>
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div>
          <Sign as="div" />
          <p>Built on 7 and 8 November 2026 at the H Company and 42AI hackathon, La Maison by Motier Ventures, Paris. In order: YouTube for the source, Gladia for the voice, ffmpeg for the keyframes, H Company Models API to write the skill and Agents API to run it, Dolibarr 22 in Docker as the target, SQL to check.</p>
          <p>{SITE_NAME} is a working name.</p>
        </div>
        <div>
          <p>Video: Tutoriel 17, Factures fournisseurs dans Dolibarr ERP CRM, Dolibarr association, 5 February 2021, Creative Commons Attribution. The relief is its audio track. The French words shown over it are the YouTube automatic captions of that video.</p>
          <p>Fonts: Hedvig Letters and Spline Sans Mono, SIL Open Font License. Code under the MIT license.</p>
        </div>
      </div>
    </footer>
  )
}
