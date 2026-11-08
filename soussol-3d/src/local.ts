// L'app locale : les formulaires écrivent sur l'ordinateur qui fait tourner Django. Sans lui, les boutons attendent.
import { boot } from './app'
;(window as unknown as { __pageBoot: boolean }).__pageBoot = true
boot((live) => {
  const on = !!live
  document.querySelectorAll<HTMLButtonElement>('[data-local-submit]').forEach((b) => {
    b.disabled = !on
    if (!on) b.title = 'The local app is not running'
  })
  document.querySelectorAll<HTMLElement>('[data-local-note]').forEach((n) => (n.hidden = on))
})
