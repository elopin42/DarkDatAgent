import { boot } from './app'
;(window as unknown as { __pageBoot: boolean }).__pageBoot = true
boot()
