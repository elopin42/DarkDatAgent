import { SITE_NAME } from './data/content'

export function ExtIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 3h7v7M13 3 4 12" />
    </svg>
  )
}

/** Le signe : la crête de la voix, un seul trait, estampé. */
export function Sign({ as = 'a' }: { as?: 'a' | 'div' }) {
  const inner = (
    <>
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="4" fill="var(--surface)" />
        <path d="M4 18c3 0 4-8 7-8s3 6 6 6 3-9 7-9" fill="none" stroke="var(--shadow)" strokeWidth="2.6" strokeLinecap="round" transform="translate(0.8 1)" />
        <path d="M4 18c3 0 4-8 7-8s3 6 6 6 3-9 7-9" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{SITE_NAME}</span>
    </>
  )
  return as === 'a' ? <a className="sign" href="/" aria-label={`${SITE_NAME}, home`}>{inner}</a> : <div className="sign">{inner}</div>
}
