import type { GameState, PlayerStats } from '../domain/types'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import {
  CalendarIcon,
  ChartIcon,
  ChevronRightIcon,
  SlidersIcon,
} from './icons'
import { formatTime } from './format'

interface HomeProps {
  session: GameState | null
  stats: PlayerStats
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
  stats,
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
        <a href="#main-action" className="wordmark" aria-label="Absolute Sudoku">
          <span>Absolute</span>
          <strong>Sudoku</strong>
        </a>
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

      <section className="home-main" id="main-action">
        <div className="home-intro">
          <p className="eyebrow">Seu tempo. Seu raciocínio.</p>
          <h1>Um tabuleiro para a vida inteira.</h1>
          <p>
            Do primeiro single às cadeias mais exigentes. Sem anúncios, sem
            distrações, sempre disponível.
          </p>
        </div>

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
            <button type="button" className="primary-action" onClick={onNew}>
              Começar um Sudoku
              <ChevronRightIcon />
            </button>
          )}

          <button type="button" className="daily-action" onClick={onDaily}>
            <CalendarIcon />
            <span>
              <small>Desafio diário</small>
              <strong>{todayLabel()}</strong>
            </span>
            <ChevronRightIcon />
          </button>

          {session && session.status !== 'completed' && (
            <button type="button" className="secondary-action" onClick={onNew}>
              Novo Sudoku
            </button>
          )}
        </div>
      </section>

      <footer className="home-footer">
        <p>
          {updateReady ? (
            <button type="button" className="update-action" onClick={onUpdate}>
              Atualização pronta · aplicar
            </button>
          ) : stats.completed > 0
            ? `${stats.completed} ${stats.completed === 1 ? 'grade concluída' : 'grades concluídas'}`
            : 'Tudo permanece neste dispositivo.'}
        </p>
        <span aria-label="Disponível offline">Offline</span>
      </footer>
    </main>
  )
}
