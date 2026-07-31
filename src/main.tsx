import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles.css'

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
