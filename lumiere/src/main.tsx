import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { startClock } from './clock'

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
startClock()
createRoot(document.getElementById('root')!).render(<App />)
