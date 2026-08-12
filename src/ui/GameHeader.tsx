import type { DifficultyId, GameStatus, VariantId } from '../domain/types'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import {
  ArrowLeftIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
} from './icons'
import { formatTime } from './format'

interface GameHeaderProps {
  variant: VariantId
  difficulty: DifficultyId
  elapsedMs: number
  showTimer: boolean
  status: GameStatus
  onBack: () => void
  onPause: () => void
  onMore: () => void
}

export function GameHeader({
  variant,
  difficulty,
  elapsedMs,
  showTimer,
  status,
  onBack,
  onPause,
  onMore,
}: GameHeaderProps) {
  const variantName = VARIANTS.find((item) => item.id === variant)?.shortName
  const difficultyName = DIFFICULTIES.find(
    (item) => item.id === difficulty,
  )?.name

  return (
    <header className="game-header">
      <button type="button" className="icon-button" onClick={onBack}>
        <ArrowLeftIcon />
        <span className="sr-only">Voltar ao início</span>
      </button>
      <div className="game-identity">
        <strong>{variantName}</strong>
        <span>{difficultyName}</span>
      </div>
      <div className="game-header-actions">
        <button
          type="button"
          className={showTimer ? 'timer-button' : 'icon-button'}
          onClick={onPause}
          aria-label={
            showTimer
              ? status === 'paused'
                ? `Continuar, tempo ${formatTime(elapsedMs)}`
                : `Pausar, tempo ${formatTime(elapsedMs)}`
              : status === 'paused'
                ? 'Continuar partida'
                : 'Pausar partida'
          }
        >
          {showTimer && (
            <span aria-hidden="true">{formatTime(elapsedMs)}</span>
          )}
          {status === 'paused' ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" className="icon-button" onClick={onMore}>
          <MoreIcon />
          <span className="sr-only">Opções da partida</span>
        </button>
      </div>
    </header>
  )
}
