import type { GameState } from '../domain/types'
import { gameKindFromState, practiceTechniqueFromPuzzle, type GameKind } from './archive'
import type { GameEventLog } from './events'

export interface SavedGameSummary {
  id: string
  puzzleId: string
  seed: string
  variant: GameState['puzzle']['variant']
  difficulty: GameState['puzzle']['difficulty']
  kind: GameKind
  practiceTechnique: ReturnType<typeof practiceTechniqueFromPuzzle>
  savedAt: number
  elapsedMs: number
  filled: number
  total: number
  /** Negative digits are givens; positive digits are player entries. */
  preview: number[]
}

export function createSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Stable identity for saves written before independent attempts existed. */
export function legacySessionId(state: GameState, log: GameEventLog | null): string {
  return `legacy:${state.puzzle.id}:${log?.startedAt ?? state.puzzle.generatedAt}`
}

export function savedGameSummary(
  id: string,
  state: GameState,
  savedAt: number,
): SavedGameSummary {
  const editable = state.cells.filter((cell) => !cell.given)
  return {
    id,
    puzzleId: state.puzzle.id,
    seed: state.puzzle.seed,
    variant: state.puzzle.variant,
    difficulty: state.puzzle.difficulty,
    kind: gameKindFromState(state),
    practiceTechnique: practiceTechniqueFromPuzzle(state.puzzle),
    savedAt,
    elapsedMs: state.elapsedMs,
    filled: editable.filter((cell) => cell.value !== null).length,
    total: editable.length,
    preview: state.cells.map((cell) => (cell.value ?? 0) * (cell.given ? -1 : 1)),
  }
}
