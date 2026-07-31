import type {
  CellColor,
  Digit,
  ErrorPolicy,
  GameSnapshot,
  GameState,
  HintStep,
  InputMode,
} from '../domain/types'
import { DIGIT_COLOR_MAP } from '../domain/catalog'
import { peersFor } from '../engine'
import { advanceClock, pauseAt, resumeAt } from './clock'
import {
  capSnapshots,
  cloneCells,
  cloneSnapshot,
  createGameState,
  isBoardComplete,
  isCellIndex,
  snapshotGame,
} from './state'

export type SelectionBehavior = 'replace' | 'add' | 'toggle'
export type EraseScope = 'mode' | 'all'

interface TimestampedAction {
  at?: number
}

export type GameAction =
  | (TimestampedAction & {
      type: 'selection/select'
      index: number
      behavior?: SelectionBehavior
    })
  | (TimestampedAction & { type: 'selection/toggle'; index: number })
  | (TimestampedAction & { type: 'selection/clear' })
  | (TimestampedAction & { type: 'input/mode'; mode: InputMode })
  | (TimestampedAction & {
      type: 'input/active-digit'
      digit: Digit | null
    })
  | (TimestampedAction & {
      type: 'input/digit'
      digit: Digit
      mode?: InputMode
      color?: CellColor
      autoRemoveCandidates?: boolean
    })
  | (TimestampedAction & { type: 'input/color'; color: CellColor | null })
  | (TimestampedAction & {
      type: 'input/erase'
      scope?: EraseScope
      mode?: InputMode
    })
  | (TimestampedAction & { type: 'history/undo' })
  | (TimestampedAction & { type: 'history/redo' })
  | (TimestampedAction & { type: 'clock/tick' })
  | (TimestampedAction & { type: 'clock/pause' })
  | (TimestampedAction & { type: 'clock/resume' })
  | (TimestampedAction & {
      type: 'hint/show'
      hint: Omit<HintStep, 'phase'> | HintStep
    })
  | (TimestampedAction & { type: 'hint/set-phase'; phase: 1 | 2 | 3 | 4 })
  | (TimestampedAction & { type: 'hint/advance' })
  | (TimestampedAction & { type: 'hint/retreat' })
  | (TimestampedAction & { type: 'hint/dismiss' })
  | (TimestampedAction & {
      type: 'hint/apply'
      index?: number
      digit?: Digit
    })
  | (TimestampedAction & { type: 'game/complete'; force?: boolean })
  | (TimestampedAction & { type: 'game/restart'; startPaused?: boolean })

export interface GameReducerOptions {
  autoRemoveCandidates: boolean
  errorPolicy: ErrorPolicy
  maxHistory: number
}

export const DEFAULT_REDUCER_OPTIONS: Readonly<GameReducerOptions> = {
  autoRemoveCandidates: true,
  errorPolicy: 'conflicts',
  maxHistory: 500,
}

export { DIGIT_COLOR_MAP } from '../domain/catalog'

function actionTime(action: GameAction): number | null {
  return typeof action.at === 'number' && Number.isFinite(action.at)
    ? action.at
    : null
}

function withCurrentClock(state: GameState, action: GameAction): GameState {
  const at = actionTime(action)
  return at === null ? state : advanceClock(state, at)
}

function withHistory(
  before: GameState,
  changes: Partial<GameState>,
  maxHistory: number,
): GameState {
  return {
    ...before,
    ...changes,
    history: capSnapshots(
      [...before.history, snapshotGame(before)],
      maxHistory,
    ),
    future: [],
  }
}

function selectedEditableCells(state: GameState): number[] {
  return state.selected.filter(
    (index) => isCellIndex(index) && !state.cells[index]?.given,
  )
}

function sortedToggle(values: readonly Digit[], digit: Digit, remove: boolean): Digit[] {
  if (remove) return values.filter((value) => value !== digit)
  if (values.includes(digit)) return [...values]
  return [...values, digit].sort((left, right) => left - right)
}

function sameCells(left: readonly GameState['cells'][number][], right: readonly GameState['cells'][number][]): boolean {
  if (left.length !== right.length) return false
  return left.every((cell, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      cell.value === other.value &&
      cell.given === other.given &&
      cell.color === other.color &&
      cell.corner.length === other.corner.length &&
      cell.center.length === other.center.length &&
      cell.corner.every((digit, digitIndex) => digit === other.corner[digitIndex]) &&
      cell.center.every((digit, digitIndex) => digit === other.center[digitIndex])
    )
  })
}

function removeCandidateFromPeers(
  cells: GameState['cells'],
  placements: readonly { index: number; digit: Digit }[],
  state: GameState,
): void {
  for (const placement of placements) {
    for (const peer of peersFor(placement.index, state.puzzle.variant)) {
      const cell = cells[peer]
      if (cell === undefined || cell.value !== null) continue
      cell.corner = cell.corner.filter((digit) => digit !== placement.digit)
      cell.center = cell.center.filter((digit) => digit !== placement.digit)
    }
  }
}

function hasPeerConflict(
  cells: readonly GameState['cells'][number][],
  state: GameState,
  index: number,
  digit: Digit,
): boolean {
  return peersFor(index, state.puzzle.variant).some(
    (peer) => cells[peer]?.value === digit,
  )
}

function mistakeCountForPlacements(
  state: GameState,
  cells: readonly GameState['cells'][number][],
  placements: readonly { index: number; digit: Digit }[],
  policy: ErrorPolicy,
): number {
  if (policy === 'on-demand' || policy === 'completion') return 0

  return placements.reduce((count, placement) => {
    const wrong =
      policy === 'solution'
        ? state.puzzle.solution[placement.index] !== placement.digit
        : hasPeerConflict(cells, state, placement.index, placement.digit)
    return count + (wrong ? 1 : 0)
  }, 0)
}

function applyValue(
  state: GameState,
  action: Extract<GameAction, { type: 'input/digit' }>,
  options: GameReducerOptions,
): GameState {
  const indices = selectedEditableCells(state)
  if (indices.length === 0) {
    return state.activeDigit === action.digit
      ? state
      : { ...state, activeDigit: action.digit }
  }

  const cells = cloneCells(state.cells)
  const shouldClear = indices.every(
    (index) => cells[index]?.value === action.digit,
  )
  const placements: Array<{ index: number; digit: Digit }> = []

  for (const index of indices) {
    const cell = cells[index]
    if (cell === undefined) continue

    if (shouldClear) {
      cell.value = null
      continue
    }

    if (cell.value !== action.digit) {
      placements.push({ index, digit: action.digit })
    }
    cell.value = action.digit
    cell.corner = []
    cell.center = []
  }

  const autoRemove =
    action.autoRemoveCandidates ?? options.autoRemoveCandidates
  if (!shouldClear && autoRemove) {
    removeCandidateFromPeers(cells, placements, state)
  }

  if (sameCells(cells, state.cells)) {
    return state.activeDigit === action.digit
      ? state
      : { ...state, activeDigit: action.digit }
  }

  const mistakes =
    state.mistakes +
    (shouldClear
      ? 0
      : mistakeCountForPlacements(
          state,
          cells,
          placements,
          options.errorPolicy,
        ))
  const complete = isBoardComplete({ cells, puzzle: state.puzzle })
  const completedAt = complete ? actionTime(action) : null

  return withHistory(
    state,
    {
      cells,
      mistakes,
      activeDigit: action.digit,
      hint: null,
      status: complete ? 'completed' : state.status,
      completedAt,
      lastResumedAt: complete ? null : state.lastResumedAt,
    },
    options.maxHistory,
  )
}

function applyCandidate(
  state: GameState,
  digit: Digit,
  mode: 'corner' | 'center',
  options: GameReducerOptions,
): GameState {
  const indices = selectedEditableCells(state).filter(
    (index) => state.cells[index]?.value === null,
  )
  if (indices.length === 0) return state

  const remove = indices.every(
    (index) => state.cells[index]?.[mode].includes(digit) ?? false,
  )
  const cells = cloneCells(state.cells)
  const otherMode = mode === 'corner' ? 'center' : 'corner'

  for (const index of indices) {
    const cell = cells[index]
    if (cell === undefined) continue
    cell[mode] = sortedToggle(cell[mode], digit, remove)
    if (!remove) {
      cell[otherMode] = cell[otherMode].filter((value) => value !== digit)
    }
  }

  if (sameCells(cells, state.cells)) return state
  return withHistory(
    state,
    { cells, activeDigit: digit, hint: null },
    options.maxHistory,
  )
}

function applyColor(
  state: GameState,
  color: CellColor | null,
  options: GameReducerOptions,
): GameState {
  const indices = state.selected.filter(isCellIndex)
  if (indices.length === 0) return state

  const cells = cloneCells(state.cells)
  const remove =
    color !== null && indices.every((index) => cells[index]?.color === color)

  for (const index of indices) {
    const cell = cells[index]
    if (cell !== undefined) cell.color = remove ? null : color
  }

  if (sameCells(cells, state.cells)) return state
  return withHistory(state, { cells, hint: null }, options.maxHistory)
}

function applyErase(
  state: GameState,
  action: Extract<GameAction, { type: 'input/erase' }>,
  options: GameReducerOptions,
): GameState {
  const indices = state.selected.filter(isCellIndex)
  if (indices.length === 0) return state

  const scope = action.scope ?? 'mode'
  const mode = action.mode ?? state.inputMode
  const cells = cloneCells(state.cells)

  for (const index of indices) {
    const cell = cells[index]
    if (cell === undefined) continue

    if (scope === 'all') {
      if (!cell.given) {
        cell.value = null
        cell.corner = []
        cell.center = []
      }
      cell.color = null
      continue
    }

    if (mode === 'value' && !cell.given) cell.value = null
    if (mode === 'corner' && !cell.given) cell.corner = []
    if (mode === 'center' && !cell.given) cell.center = []
    if (mode === 'color') cell.color = null
  }

  if (sameCells(cells, state.cells)) return state
  return withHistory(
    state,
    {
      cells,
      activeDigit: mode === 'value' ? null : state.activeDigit,
      hint: null,
      completedAt: null,
      status: state.status === 'completed' ? 'playing' : state.status,
    },
    options.maxHistory,
  )
}

function restoreSnapshot(
  state: GameState,
  snapshot: GameSnapshot,
  direction: 'undo' | 'redo',
  at: number | null,
  maxHistory: number,
): GameState {
  const source = direction === 'undo' ? state.history : state.future
  const destination = direction === 'undo' ? state.future : state.history
  const remaining = source.slice(0, -1).map(cloneSnapshot)
  const restoredStatus = state.status === 'paused' ? 'paused' : 'playing'
  const destinationSnapshots = capSnapshots(
    [...destination, snapshotGame(state)],
    maxHistory,
  )

  return {
    ...state,
    cells: cloneCells(snapshot.cells),
    elapsedMs: snapshot.elapsedMs,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    hint: null,
    completedAt: null,
    status: restoredStatus,
    lastResumedAt:
      restoredStatus === 'playing'
        ? (at ?? state.lastResumedAt)
        : null,
    history: direction === 'undo' ? remaining : destinationSnapshots,
    future: direction === 'undo' ? destinationSnapshots : remaining,
  }
}

function reducePlayingAction(
  state: GameState,
  action: GameAction,
  options: GameReducerOptions,
): GameState {
  if (action.type === 'input/digit') {
    const mode = action.mode ?? state.inputMode
    if (mode === 'value') return applyValue(state, action, options)
    if (mode === 'corner' || mode === 'center') {
      return applyCandidate(state, action.digit, mode, options)
    }
    const color = action.color ?? DIGIT_COLOR_MAP[action.digit]
    return color === undefined ? state : applyColor(state, color, options)
  }

  if (action.type === 'input/color') {
    return applyColor(state, action.color, options)
  }

  if (action.type === 'input/erase') {
    return applyErase(state, action, options)
  }

  return state
}

export function reduceGame(
  currentState: GameState,
  action: GameAction,
  overrides: Partial<GameReducerOptions> = {},
): GameState {
  const options: GameReducerOptions = {
    ...DEFAULT_REDUCER_OPTIONS,
    ...overrides,
  }
  const at = actionTime(action)

  if (action.type === 'clock/tick') {
    return at === null ? currentState : advanceClock(currentState, at)
  }

  if (action.type === 'clock/pause') {
    return at === null ? currentState : pauseAt(currentState, at)
  }

  if (action.type === 'clock/resume') {
    return at === null ? currentState : resumeAt(currentState, at)
  }

  const state = withCurrentClock(currentState, action)

  if (action.type === 'selection/select') {
    if (!isCellIndex(action.index)) return state
    const behavior = action.behavior ?? 'replace'
    const alreadySelected = state.selected.includes(action.index)
    let selected: number[]

    if (behavior === 'replace') selected = [action.index]
    else if (behavior === 'add') {
      selected = alreadySelected
        ? [...state.selected]
        : [...state.selected, action.index]
    } else {
      selected = alreadySelected
        ? state.selected.filter((index) => index !== action.index)
        : [...state.selected, action.index]
    }

    return {
      ...state,
      selected,
      anchor: selected.includes(action.index)
        ? action.index
        : (selected.at(-1) ?? -1),
    }
  }

  if (action.type === 'selection/toggle') {
    return reduceGame(
      state,
      { type: 'selection/select', index: action.index, behavior: 'toggle' },
      options,
    )
  }

  if (action.type === 'selection/clear') {
    return state.selected.length === 0
      ? state
      : { ...state, selected: [], anchor: -1 }
  }

  if (action.type === 'input/mode') {
    return state.inputMode === action.mode
      ? state
      : { ...state, inputMode: action.mode }
  }

  if (action.type === 'input/active-digit') {
    return state.activeDigit === action.digit
      ? state
      : { ...state, activeDigit: action.digit }
  }

  if (
    action.type === 'input/digit' ||
    action.type === 'input/color' ||
    action.type === 'input/erase'
  ) {
    return state.status === 'playing'
      ? reducePlayingAction(state, action, options)
      : state
  }

  if (action.type === 'history/undo') {
    const snapshot = state.history.at(-1)
    return snapshot === undefined
      ? state
      : restoreSnapshot(state, snapshot, 'undo', at, options.maxHistory)
  }

  if (action.type === 'history/redo') {
    const snapshot = state.future.at(-1)
    return snapshot === undefined
      ? state
      : restoreSnapshot(state, snapshot, 'redo', at, options.maxHistory)
  }

  if (action.type === 'hint/show') {
    if (state.status !== 'playing') return state
    const hint: HintStep = { ...action.hint, phase: 1 }
    return withHistory(
      state,
      { hint, hintsUsed: state.hintsUsed + 1 },
      options.maxHistory,
    )
  }

  if (action.type === 'hint/set-phase') {
    return state.hint === null
      ? state
      : { ...state, hint: { ...state.hint, phase: action.phase } }
  }

  if (action.type === 'hint/advance') {
    if (state.hint === null || state.hint.phase === 4) return state
    return {
      ...state,
      hint: {
        ...state.hint,
        phase: (state.hint.phase + 1) as HintStep['phase'],
      },
    }
  }

  if (action.type === 'hint/retreat') {
    if (state.hint === null || state.hint.phase === 1) return state
    return {
      ...state,
      hint: {
        ...state.hint,
        phase: (state.hint.phase - 1) as HintStep['phase'],
      },
    }
  }

  if (action.type === 'hint/dismiss') {
    return state.hint === null ? state : { ...state, hint: null }
  }

  if (action.type === 'hint/apply') {
    if (state.hint === null || state.hint.phase !== 4) return state
    const index = action.index ?? state.hint.cells.at(-1)
    const digit = action.digit ?? state.hint.digit
    if (index === undefined || digit === undefined || !isCellIndex(index)) {
      return state
    }
    const selectedState: GameState = {
      ...state,
      selected: [index],
      anchor: index,
      hint: null,
    }
    const digitAction: Extract<GameAction, { type: 'input/digit' }> = {
      type: 'input/digit',
      digit,
      mode: 'value',
    }
    if (at !== null) digitAction.at = at
    return applyValue(selectedState, digitAction, options)
  }

  if (action.type === 'game/complete') {
    if (state.status === 'completed') return state
    if (!(action.force ?? false) && !isBoardComplete(state)) return state
    return {
      ...state,
      status: 'completed',
      completedAt: at,
      lastResumedAt: null,
      hint: null,
    }
  }

  if (action.type === 'game/restart') {
    return createGameState(state.puzzle, {
      now: at ?? state.lastResumedAt ?? 0,
      startPaused: action.startPaused ?? false,
      selectFirstEmpty: true,
    })
  }

  return state
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  return reduceGame(state, action)
}

export function createGameReducer(
  options: Partial<GameReducerOptions>,
): (state: GameState, action: GameAction) => GameState {
  return (state, action) => reduceGame(state, action, options)
}

function timed<T extends GameAction>(action: T, at?: number): T {
  if (at !== undefined) action.at = at
  return action
}

export const gameActions = {
  select: (
    index: number,
    behavior: SelectionBehavior = 'replace',
    at?: number,
  ): GameAction => timed({ type: 'selection/select', index, behavior }, at),
  toggleSelection: (index: number, at?: number): GameAction =>
    timed({ type: 'selection/toggle', index }, at),
  clearSelection: (at?: number): GameAction =>
    timed({ type: 'selection/clear' }, at),
  setMode: (mode: InputMode, at?: number): GameAction =>
    timed({ type: 'input/mode', mode }, at),
  setActiveDigit: (digit: Digit | null, at?: number): GameAction =>
    timed({ type: 'input/active-digit', digit }, at),
  setDigit: (digit: Digit, at?: number, mode?: InputMode): GameAction =>
    timed(
      mode === undefined
        ? { type: 'input/digit', digit }
        : { type: 'input/digit', digit, mode },
      at,
    ),
  setColor: (color: CellColor | null, at?: number): GameAction =>
    timed({ type: 'input/color', color }, at),
  erase: (at?: number, scope: EraseScope = 'mode'): GameAction =>
    timed({ type: 'input/erase', scope }, at),
  undo: (at?: number): GameAction => timed({ type: 'history/undo' }, at),
  redo: (at?: number): GameAction => timed({ type: 'history/redo' }, at),
  tick: (at: number): GameAction => ({ type: 'clock/tick', at }),
  pause: (at: number): GameAction => ({ type: 'clock/pause', at }),
  resume: (at: number): GameAction => ({ type: 'clock/resume', at }),
  showHint: (
    hint: Omit<HintStep, 'phase'> | HintStep,
    at?: number,
  ): GameAction => timed({ type: 'hint/show', hint }, at),
  setHintPhase: (phase: HintStep['phase'], at?: number): GameAction =>
    timed({ type: 'hint/set-phase', phase }, at),
  advanceHint: (at?: number): GameAction =>
    timed({ type: 'hint/advance' }, at),
  retreatHint: (at?: number): GameAction =>
    timed({ type: 'hint/retreat' }, at),
  dismissHint: (at?: number): GameAction =>
    timed({ type: 'hint/dismiss' }, at),
  applyHint: (at?: number): GameAction =>
    timed({ type: 'hint/apply' }, at),
  complete: (at: number, force = false): GameAction => ({
    type: 'game/complete',
    at,
    force,
  }),
  restart: (at: number, startPaused = false): GameAction => ({
    type: 'game/restart',
    at,
    startPaused,
  }),
} as const
