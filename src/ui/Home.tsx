import type { GameState } from '../domain/types'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import {
  ChartIcon,
  ChevronRightIcon,
  SlidersIcon,
} from './icons'
import { formatTime } from './format'

interface HomeProps {
  session: GameState | null
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
  updateReady,
  onUpdate,
  onContinue,
  onDaily,
  onNew,
  onStats,
  onSettings,
}: HomeProps) {
  const sessionVariant = session
    ? VARIANTS.find((item) => item.id === session.puzzle.variant)?.name
    : null
  const sessionDifficulty = session
    ? DIFFICULTIES.find((item) => item.id === session.puzzle.difficulty)?.name
    : null

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
        <div className="home-actions">
          {session && session.status !== 'completed' ? (
            <button
              type="button"
              className="resume-action"
              onClick={onContinue}
            >
              <span>
                <small>Continuar</small>
                <strong>
                  {sessionVariant} · {sessionDifficulty}
                </strong>
              </span>
              <span className="resume-meta">
                {formatTime(session.elapsedMs)}
                <ChevronRightIcon />
              </span>
            </button>
          ) : (
            <button type="button" className="new-game-action" onClick={onNew}>
              <strong>Novo Sudoku</strong>
              <ChevronRightIcon />
            </button>
          )}

          <button type="button" className="daily-action" onClick={onDaily}>
            <span>
              <small>Desafio diário</small>
              <strong>{todayLabel()}</strong>
            </span>
            <ChevronRightIcon />
          </button>

          {session && session.status !== 'completed' && (
            <button type="button" className="new-game-action" onClick={onNew}>
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
      </section>
    </main>
  )
}
