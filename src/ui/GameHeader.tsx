import type { DifficultyId, GameStatus, VariantId } from '../domain/types'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import {
  ArrowLeftIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
} from './icons'

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

export function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remainder
        .toString()
        .padStart(2, '0')}`
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
        {showTimer && (
          <button
            type="button"
            className="timer-button"
            onClick={onPause}
            aria-label={
              status === 'paused'
                ? `Continuar, tempo ${formatTime(elapsedMs)}`
                : `Pausar, tempo ${formatTime(elapsedMs)}`
            }
          >
            <span aria-hidden="true">{formatTime(elapsedMs)}</span>
            {status === 'paused' ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
        <button type="button" className="icon-button" onClick={onMore}>
          <MoreIcon />
          <span className="sr-only">Opções da partida</span>
        </button>
      </div>
    </header>
  )
}
