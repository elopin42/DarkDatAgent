import { useCallback, useEffect, useRef } from 'react'
import { Stage } from './scene/Stage'
import { Problem } from './sections/Problem'
import { Chain } from './sections/Chain'
import { Pair } from './sections/Pair'
import { Proof } from './sections/Proof'
import { Difference, Next, Footer } from './sections/Closing'
import { Sign, ExtIcon } from './ui'
import { REPLAY_URL } from './data/content'
import { ScrollTrigger, frozenS, scrollToFraction, reduced } from './clock'
import { wireReveals, rakeIn } from './gestures'

declare global { interface Window { __frontReady?: boolean } }

export function App() {
  const done = useRef(false)
  const onReady = useCallback(() => {
    if (done.current) return
    done.current = true
    document.fonts.ready.then(() => {
      ScrollTrigger.refresh()
      wireReveals()
      const h1 = document.querySelector('.hero-copy h1')
      if (h1 && !reduced) rakeIn(h1, 0.15)
      if (frozenS !== null) scrollToFraction(frozenS)
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__frontReady = true }))
    })
  }, [])

  useEffect(() => { const t = setTimeout(onReady, 12000); return () => clearTimeout(t) }, [onReady])

  return (
    <>
      <header className="top">
        <Sign />
        <nav aria-label="Main">
          <a href="/pipeline/">Pipeline</a>
          <a href="/board/">Board</a>
          <a href="/bench/">Bench</a>
          <a href="/skills/">Skills</a>
          <a className="btn stamp" href={REPLAY_URL} rel="noopener noreferrer">Watch the run <ExtIcon /></a>
        </nav>
      </header>
      <main>
        <Stage onReady={onReady} />
        <Problem />
        <Chain />
        <Pair />
        <Proof />
        <Difference />
        <Next />
      </main>
      <Footer />
    </>
  )
}
