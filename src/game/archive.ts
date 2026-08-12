import type {
  ErrorPolicy,
  GameSettings,
  GameState,
} from '../domain/types'
import type { LogicalTechnique } from '../engine'
import { replayEventLog, type GameEventLog } from './events'
import { isBoardComplete } from './state'

export const ARCHIVED_GAME_VERSION = 1 as const

export type GameKind = 'standard' | 'daily' | 'practice'

export interface ReplaySettings {
  autoRemoveCandidates: boolean
  errorPolicy: ErrorPolicy
}

export interface ArchivedGame {
  version: typeof ARCHIVED_GAME_VERSION
  id: string
  savedAt: number
  kind: GameKind
  practiceTechnique: LogicalTechnique | null
  state: GameState
  eventLog: GameEventLog | null
  replaySettings: ReplaySettings
}

export interface ArchivedGameSummary {
  id: string
  puzzleId: string
  variant: GameState['puzzle']['variant']
  difficulty: GameState['puzzle']['difficulty']
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  completedAt: number
  kind: GameKind
  practiceTechnique: LogicalTechnique | null
  replayable: boolean
}

const PRACTICE_TECHNIQUES = new Set<LogicalTechnique>([
  'naked-single',
  'hidden-single',
  'locked-candidates-pointing',
  'locked-candidates-claiming',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'hidden-triple',
  'naked-quad',
  'hidden-quad',
  'x-wing',
  'skyscraper',
  'swordfish',
  'xy-wing',
  'jellyfish',
])

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function practiceTechniqueFromPuzzle(
  puzzle: Pick<GameState['puzzle'], 'seed'>,
): LogicalTechnique | null {
  const match = puzzle.seed.match(
    /^absolute-sudoku:practice:v\d+:g\d+:([^:]+):/,
  )
  const technique = match?.[1]
  return technique !== undefined &&
    PRACTICE_TECHNIQUES.has(technique as LogicalTechnique)
    ? (technique as LogicalTechnique)
    : null
}

export function gameKindFromState(
  state: Pick<GameState, 'puzzle'>,
): GameKind {
  if (practiceTechniqueFromPuzzle(state.puzzle) !== null) return 'practice'
  const identity = `${state.puzzle.id} ${state.puzzle.seed}`
  return /\bdaily\b/i.test(identity) ? 'daily' : 'standard'
}

export function replaySettingsFromGameSettings(
  settings: Pick<GameSettings, 'autoRemoveCandidates' | 'errorPolicy'>,
): ReplaySettings {
  return {
    autoRemoveCandidates: settings.autoRemoveCandidates,
    errorPolicy: settings.errorPolicy,
  }
}

export function createArchivedGame(
  state: GameState,
  eventLog: GameEventLog | null,
  replaySettings: ReplaySettings,
  savedAt = Date.now(),
): ArchivedGame {
  if (!isBoardComplete(state) || state.completedAt === null) {
    throw new Error('Only completed games can be archived.')
  }
  const kind = gameKindFromState(state)
  const safeEventLog =
    eventLog !== null && replayMatchesArchivedState(state, eventLog, replaySettings)
      ? eventLog
      : null
  return {
    version: ARCHIVED_GAME_VERSION,
    id: `${state.puzzle.id}:${state.completedAt}`,
    savedAt,
    kind,
    practiceTechnique:
      kind === 'practice'
        ? practiceTechniqueFromPuzzle(state.puzzle)
        : null,
    state: cloneJson(state),
    eventLog: safeEventLog === null ? null : cloneJson(safeEventLog),
    replaySettings: { ...replaySettings },
  }
}

export function replayMatchesArchivedState(
  state: GameState,
  eventLog: GameEventLog,
  replaySettings: ReplaySettings,
): boolean {
  if (eventLog.puzzle.id !== state.puzzle.id) return false
  try {
    const replayed = replayEventLog(eventLog, replaySettings)
    return replayed.cells.every((cell, index) => {
      const archived = state.cells[index]
      return (
        archived !== undefined &&
        cell.value === archived.value &&
        cell.given === archived.given &&
        cell.color === archived.color &&
        cell.corner.length === archived.corner.length &&
        cell.center.length === archived.center.length &&
        cell.corner.every(
          (digit, digitIndex) => digit === archived.corner[digitIndex],
        ) &&
        cell.center.every(
          (digit, digitIndex) => digit === archived.center[digitIndex],
        )
      )
    })
  } catch {
    return false
  }
}

export function archivedGameSummary(
  archived: ArchivedGame,
): ArchivedGameSummary {
  return {
    id: archived.id,
    puzzleId: archived.state.puzzle.id,
    variant: archived.state.puzzle.variant,
    difficulty: archived.state.puzzle.difficulty,
    elapsedMs: archived.state.elapsedMs,
    mistakes: archived.state.mistakes,
    hintsUsed: archived.state.hintsUsed,
    completedAt: archived.state.completedAt ?? archived.savedAt,
    kind: archived.kind,
    practiceTechnique: archived.practiceTechnique,
    replayable: archived.eventLog !== null,
  }
}
