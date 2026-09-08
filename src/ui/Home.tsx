import type { PwaInstallControl } from '../pwa/usePwaInstall'
import type { SavedGameSummary } from '../game'
import {
  ChartIcon,
  ChevronRightIcon,
  InstallIcon,
  SlidersIcon,
} from './icons'
import { formatTime } from './format'
import { sessionLabel } from './sessionFormat'

interface HomeProps {
  session: SavedGameSummary | null
  savedCount: number
  busy: boolean
  error: string | null
  onSaved: () => void
  install: PwaInstallControl
  updateReady: boolean
  onUpdate: () => void
  onContinue: () => void
  onDaily: () => void
  onNew: () => void
  onStats: () => void
  onSettings: () => void
}

function todayLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
}

export function Home({
  session,
  savedCount,
  busy,
  error,
  onSaved,
  install,
  updateReady,
  onUpdate,
  onContinue,
  onDaily,
  onNew,
  onStats,
  onSettings,
}: HomeProps) {
  return (
    <main className="home-screen">
      <header className="home-header">
        <h1 className="wordmark" aria-label="Absolute Sudoku">
          <span>Absolute</span>
          <strong>Sudoku</strong>
        </h1>
        <nav aria-label="Navegação principal">
          <button
            type="button"
            className="text-icon-button"
            aria-label="Estatísticas"
            onClick={onStats}
          >
            <ChartIcon />
            <span>Estatísticas</span>
          </button>
          <button
            type="button"
            className="text-icon-button"
            aria-label="Ajustes"
            onClick={onSettings}
          >
            <SlidersIcon />
            <span>Ajustes</span>
          </button>
        </nav>
      </header>

      <section className="home-main" aria-label="Jogar">
        {error && <p className="generation-error" role="alert">{error}</p>}
        <div className="home-actions">
          {session ? (
            <div className="home-resume-group">
              <button
                type="button"
                className="resume-action"
                onClick={onContinue}
                disabled={busy}
              >
                <span>
                  <small>Continuar</small>
                  <strong>{sessionLabel(session)}</strong>
                </span>
                <span className="resume-meta">
                  {formatTime(session.elapsedMs)}
                  <ChevronRightIcon />
                </span>
              </button>
              <button type="button" className="saved-games-action" onClick={onSaved} disabled={busy}>
                <span>Partidas salvas <span className="saved-count">· {savedCount}</span></span>
                <ChevronRightIcon />
              </button>
            </div>
          ) : (
            <button type="button" className="new-game-action" onClick={onNew} disabled={busy}>
              <strong>Novo Sudoku</strong>
              <ChevronRightIcon />
            </button>
          )}

          <button type="button" className="daily-action" onClick={onDaily} disabled={busy}>
            <span>
              <small>Desafio diário</small>
              <strong>{busy ? 'Preparando partida…' : todayLabel()}</strong>
            </span>
            <ChevronRightIcon />
          </button>

          {session && (
            <button type="button" className="new-game-action" onClick={onNew} disabled={busy}>
              <strong>Novo Sudoku</strong>
              <ChevronRightIcon />
            </button>
          )}

          {updateReady && (
            <button type="button" className="update-action" onClick={onUpdate}>
              Atualização pronta · aplicar
            </button>
          )}
        </div>

        {install.kind && (
          <div className="install-prompt">
            <button
              type="button"
              className="install-action"
              data-expanded={install.instructionsOpen || undefined}
              aria-expanded={
                install.guidance ? install.instructionsOpen : undefined
              }
              aria-controls={
                install.guidance ? 'pwa-install-guidance' : undefined
              }
              onClick={() => void install.install()}
            >
              <InstallIcon />
              <span>Instalar o app</span>
            </button>
            {install.instructionsOpen && install.guidance && (
              <p id="pwa-install-guidance" role="status">
                {install.guidance}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
