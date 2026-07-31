import type { GameState, HintStep, PuzzleDefinition } from '../domain/types'
import { VARIANTS } from '../domain/catalog'
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  LightbulbIcon,
  PlayIcon,
  SlidersIcon,
} from './icons'
import { formatTime } from './GameHeader'

export function PauseOverlay({
  puzzle,
  elapsedMs,
  onResume,
  onExit,
}: {
  puzzle: PuzzleDefinition
  elapsedMs: number
  onResume: () => void
  onExit: () => void
}) {
  return (
    <section className="pause-overlay" aria-label="Partida pausada">
      <div className="pause-mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <p>Pausado</p>
      <strong>{formatTime(elapsedMs)}</strong>
      <div>
        <button type="button" className="primary-action" onClick={onResume}>
          <PlayIcon />
          Continuar
        </button>
        <button type="button" className="secondary-action" onClick={onExit}>
          Voltar ao início
        </button>
      </div>
    </section>
  )
}

export function HintPanel({
  hint,
  onNext,
  onClose,
}: {
  hint: HintStep
  onNext: () => void
  onClose: () => void
}) {
  const techniqueNames: Record<string, string> = {
    'naked-single': 'Single direto',
    'hidden-single': 'Single oculto',
    'forcing-choice': 'Teste por contradição',
    conflict: 'Conflito lógico',
    'incorrect-value': 'Revisão necessária',
    contradiction: 'Contradição',
  }
  const nextLabel =
    hint.phase === 1
      ? 'Mostrar a região'
      : hint.phase === 2
        ? 'Explicar o padrão'
        : hint.phase === 3
          ? 'Mostrar o passo'
          : 'Aplicar'
  return (
    <aside className="hint-panel" aria-live="polite">
      <LightbulbIcon />
      <div>
        <small>{techniqueNames[hint.technique] ?? hint.technique}</small>
        <strong>{hint.title}</strong>
        <p>{hint.explanation}</p>
      </div>
      <div className="hint-actions">
        <button type="button" onClick={onNext}>
          {nextLabel}
        </button>
        <button type="button" className="icon-button" onClick={onClose}>
          <CloseIcon />
          <span className="sr-only">Fechar dica</span>
        </button>
      </div>
    </aside>
  )
}

export function GameMenu({
  onClose,
  onSettings,
  onCheck,
  onRestart,
  onCopy,
  copied,
}: {
  onClose: () => void
  onSettings: () => void
  onCheck: () => void
  onRestart: () => void
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="game-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-options-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="game-options-title">Partida</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <CloseIcon />
            <span className="sr-only">Fechar</span>
          </button>
        </header>
        <button type="button" onClick={onCheck}>
          <CheckIcon />
          <span>
            <strong>Verificar grade</strong>
            <small>Mostra conflitos apenas quando você pedir.</small>
          </span>
        </button>
        <button type="button" onClick={onSettings}>
          <SlidersIcon />
          <span>
            <strong>Ajustes do jogo</strong>
            <small>Realces, erros, resposta e aparência.</small>
          </span>
        </button>
        <button type="button" onClick={onCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>
            <strong>{copied ? 'Estado copiado' : 'Copiar estado completo'}</strong>
            <small>Grade, notas, cores e tempo em um código local.</small>
          </span>
        </button>
        <button type="button" className="danger-row" onClick={onRestart}>
          <span className="restart-symbol" aria-hidden="true">
            ↺
          </span>
          <span>
            <strong>Recomeçar esta grade</strong>
            <small>O estado atual continua disponível no desfazer.</small>
          </span>
        </button>
      </section>
    </div>
  )
}

export function CompletionOverlay({
  game,
  onHome,
  onAgain,
}: {
  game: GameState
  onHome: () => void
  onAgain: () => void
}) {
  return (
    <section className="completion-overlay" aria-live="polite">
      <div className="completion-check" aria-hidden="true">
        <CheckIcon />
      </div>
      <p>Grade concluída</p>
      <h2>
        {VARIANTS.find((item) => item.id === game.puzzle.variant)?.name}
      </h2>
      <dl>
        <div>
          <dt>Tempo</dt>
          <dd>{formatTime(game.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Dicas</dt>
          <dd>{game.hintsUsed}</dd>
        </div>
        <div>
          <dt>Erros</dt>
          <dd>{game.mistakes}</dd>
        </div>
      </dl>
      <div>
        <button type="button" className="primary-action" onClick={onAgain}>
          Outra grade
        </button>
        <button type="button" className="secondary-action" onClick={onHome}>
          Voltar ao início
        </button>
      </div>
    </section>
  )
}
