import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles.css'

const preventZoom = (event: Event) => event.preventDefault()

for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(eventName, preventZoom, { passive: false })
}

document.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) event.preventDefault()
  },
  { passive: false },
)

document.addEventListener('keydown', (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    ['+', '=', '-', '0'].includes(event.key)
  ) {
    event.preventDefault()
  }
})

const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('absolute-sudoku:update-ready', { detail: updateSW }),
    )
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
