import type { CellState, GameState } from '../domain/types'
import {
  findNextLogicalStep,
  type LogicalStep,
} from '../engine/analyzer'
import type { GameEvent, GameEventLog } from './events'
import {
  reduceGame,
  type GameAction,
  type GameReducerOptions,
} from './reducer'
import { createGameState } from './state'

export type ReviewAssessment =
  | 'initial'
  | 'logical-match'
  | 'valid-alternative'
  | 'incorrect'
  | 'annotation'
  | 'assistance'
  | 'revision'

export interface ReviewDelta {
  cells: number[]
  valuesPlaced: number
  valuesRemoved: number
  candidatesAdded: number
  candidatesRemoved: number
  colorsChanged: number
}

export interface ReviewFrame {
  position: number
  event: GameEvent | null
  state: GameState
  delta: ReviewDelta
  logicalStep: LogicalStep | null
  assessment: ReviewAssessment
  important: boolean
}

const REVIEWED_ACTIONS = new Set<GameAction['type']>([
  'input/digit',
  'input/color',
  'input/erase',
  'history/undo',
  'history/redo',
  'hint/show',
  'hint/apply',
  'game/auto-finish',
  'game/restart',
])

function compactState(state: GameState): GameState {
  return { ...state, history: [], future: [] }
}

function setDifferenceSize(
  left: readonly number[],
  right: readonly number[],
): number {
  const rightSet = new Set(right)
  return left.reduce(
    (count, value) => count + (rightSet.has(value) ? 0 : 1),
    0,
  )
}

function cellDelta(before: CellState, after: CellState) {
  return {
    valuesPlaced: before.value === null && after.value !== null ? 1 : 0,
    valuesRemoved: before.value !== null && after.value === null ? 1 : 0,
    candidatesAdded:
      setDifferenceSize(after.corner, before.corner) +
      setDifferenceSize(after.center, before.center),
    candidatesRemoved:
      setDifferenceSize(before.corner, after.corner) +
      setDifferenceSize(before.center, after.center),
    colorsChanged: before.color === after.color ? 0 : 1,
  }
}

function reviewDelta(before: GameState, after: GameState): ReviewDelta {
  const result: ReviewDelta = {
    cells: [],
    valuesPlaced: 0,
    valuesRemoved: 0,
    candidatesAdded: 0,
    candidatesRemoved: 0,
    colorsChanged: 0,
  }
  before.cells.forEach((cell, index) => {
    const next = after.cells[index]
    if (next === undefined) return
    const delta = cellDelta(cell, next)
    const changed = Object.values(delta).some((value) => value > 0)
    if (changed) result.cells.push(index)
    result.valuesPlaced += delta.valuesPlaced
    result.valuesRemoved += delta.valuesRemoved
    result.candidatesAdded += delta.candidatesAdded
    result.candidatesRemoved += delta.candidatesRemoved
    result.colorsChanged += delta.colorsChanged
  })
  return result
}

function boardValues(state: GameState): number[] {
  return state.cells.map((cell) => cell.value ?? 0)
}

function eventLogicalStep(
  before: GameState,
  action: GameAction,
): LogicalStep | null {
  if (
    action.type !== 'input/digit' &&
    action.type !== 'input/erase' &&
    action.type !== 'hint/show' &&
    action.type !== 'hint/apply'
  ) {
    return null
  }
  return findNextLogicalStep(boardValues(before), before.puzzle.variant)
}

function matchesLogicalChange(
  before: GameState,
  after: GameState,
  delta: ReviewDelta,
  logicalStep: LogicalStep,
): boolean {
  const changedValues = delta.cells.flatMap((cell) => {
    const previous = before.cells[cell]
    const next = after.cells[cell]
    return next !== undefined &&
      previous?.value !== next.value &&
      next.value !== null
      ? [{ cell, digit: next.value }]
      : []
  })
  if (changedValues.length > 0) {
    return changedValues.every((change) =>
      logicalStep.placements.some(
        (placement) =>
          placement.cell === change.cell && placement.digit === change.digit,
      ),
    )
  }

  if (delta.candidatesRemoved > 0) {
    return logicalStep.eliminations.some((elimination) => {
      const beforeCell = before.cells[elimination.cell]
      const afterCell = after.cells[elimination.cell]
      if (beforeCell === undefined || afterCell === undefined) return false
      return elimination.digits.some(
        (digit) =>
          (beforeCell.corner.includes(digit) ||
            beforeCell.center.includes(digit)) &&
          !afterCell.corner.includes(digit) &&
          !afterCell.center.includes(digit),
      )
    })
  }
  return false
}

function assessmentFor(
  before: GameState,
  after: GameState,
  action: GameAction,
  delta: ReviewDelta,
  logicalStep: LogicalStep | null,
): ReviewAssessment {
  if (action.type === 'hint/show' || action.type === 'hint/apply' || action.type === 'game/auto-finish') {
    return 'assistance'
  }
  if (
    action.type === 'history/undo' ||
    action.type === 'history/redo' ||
    action.type === 'game/restart'
  ) {
    return 'revision'
  }
  if (
    action.type === 'input/color' ||
    (action.type === 'input/digit' &&
      (action.mode ?? before.inputMode) !== 'value') ||
    delta.candidatesAdded > 0 ||
    delta.colorsChanged > 0
  ) {
    return logicalStep !== null &&
      matchesLogicalChange(before, after, delta, logicalStep)
      ? 'logical-match'
      : 'annotation'
  }
  const inserted = delta.cells.filter((cell) => {
    const value = after.cells[cell]?.value
    return value !== null && value !== undefined
  })
  if (
    inserted.some(
      (cell) => after.cells[cell]?.value !== after.puzzle.solution[cell],
    )
  ) {
    return 'incorrect'
  }
  if (
    logicalStep !== null &&
    matchesLogicalChange(before, after, delta, logicalStep)
  ) {
    return 'logical-match'
  }
  return inserted.length > 0 ? 'valid-alternative' : 'annotation'
}

export function buildReviewFrames(
  log: GameEventLog,
  options: Partial<GameReducerOptions> = {},
): ReviewFrame[] {
  let state = createGameState(log.puzzle, {
    now: log.startedAt,
    startPaused: log.initial.startPaused,
    selectFirstEmpty: log.initial.selectFirstEmpty,
  })
  const frames: ReviewFrame[] = [
    {
      position: 0,
      event: null,
      state: compactState(state),
      delta: {
        cells: [],
        valuesPlaced: 0,
        valuesRemoved: 0,
        candidatesAdded: 0,
        candidatesRemoved: 0,
        colorsChanged: 0,
      },
      logicalStep: findNextLogicalStep(boardValues(state), state.puzzle.variant),
      assessment: 'initial',
      important: false,
    },
  ]

  for (const event of log.events) {
    const before = state
    const action = { ...event.action, at: event.at } as GameAction
    state = reduceGame(state, action, options)
    if (!REVIEWED_ACTIONS.has(action.type) || state === before) continue
    const delta = reviewDelta(before, state)
    const logicalStep = eventLogicalStep(before, action)
    const assessment = assessmentFor(
      before,
      state,
      action,
      delta,
      logicalStep,
    )
    frames.push({
      position: frames.length,
      event,
      state: compactState(state),
      delta,
      logicalStep,
      assessment,
      important:
        assessment === 'incorrect' ||
        assessment === 'assistance' ||
        assessment === 'revision' ||
        (assessment === 'logical-match' &&
          logicalStep !== null &&
          logicalStep.score >= 6),
    })
  }
  return frames
}
