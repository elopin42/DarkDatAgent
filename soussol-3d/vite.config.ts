import { defineConfig } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
// Une entrée par route de l'app (tools/pages.json, écrit par tools/build-pages-3.mjs), plus la landing.
const pages: string[] = existsSync('tools/pages.json') ? JSON.parse(readFileSync('tools/pages.json', 'utf8')) : []
const input: Record<string, string> = { home: resolve('index.html') }
for (const p of pages) input[p.replace(/\/index\.html$/, '').replace(/[^\w]+/g, '_')] = resolve(p)
export default defineConfig({
  appType: 'mpa',
  server: { port: 5211, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5211, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 900, rollupOptions: { input } },
})
