import type { GameState } from '../domain/types'
import type { LogicalTechnique } from '../engine'
import { practiceTechniqueFromPuzzle } from './archive'
import { isBoardComplete } from './state'

export const PRACTICE_PROGRESS_VERSION = 1 as const

export interface PracticeRecord {
  id: string
  puzzleId: string
  technique: LogicalTechnique
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  completedAt: number
}

export interface PracticeProgress {
  version: typeof PRACTICE_PROGRESS_VERSION
  records: PracticeRecord[]
}

export const EMPTY_PRACTICE_PROGRESS: PracticeProgress = {
  version: PRACTICE_PROGRESS_VERSION,
  records: [],
}

export function createPracticeRecord(state: GameState): PracticeRecord | null {
  const technique = practiceTechniqueFromPuzzle(state.puzzle)
  if (
    technique === null ||
    !isBoardComplete(state) ||
    state.completedAt === null
  ) {
    return null
  }
  return {
    id: `${state.puzzle.id}:${state.completedAt}`,
    puzzleId: state.puzzle.id,
    technique,
    elapsedMs: Math.max(0, state.elapsedMs),
    mistakes: Math.max(0, state.mistakes),
    hintsUsed: Math.max(0, state.hintsUsed),
    completedAt: state.completedAt,
  }
}

export function addPracticeRecord(
  progress: PracticeProgress,
  record: PracticeRecord,
): PracticeProgress {
  if (progress.records.some((existing) => existing.id === record.id)) {
    return {
      version: PRACTICE_PROGRESS_VERSION,
      records: progress.records.map((entry) => ({ ...(entry.id === record.id ? record : entry) })),
    }
  }
  return {
    version: PRACTICE_PROGRESS_VERSION,
    records: [...progress.records.map((entry) => ({ ...entry })), { ...record }],
  }
}
