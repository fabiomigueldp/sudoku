import type {
  CellState,
  GameSnapshot,
  GameState,
  PuzzleDefinition,
} from '../domain/types'

export const BOARD_SIZE = 81
export const EMPTY_CELL = 0

export interface CreateGameOptions {
  now?: number
  startPaused?: boolean
  selectFirstEmpty?: boolean
}

function isGridDigit(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 9
}

export function assertPuzzleDefinition(
  puzzle: PuzzleDefinition,
): asserts puzzle is PuzzleDefinition {
  if (puzzle.givens.length !== BOARD_SIZE) {
    throw new RangeError(`A puzzle must contain ${BOARD_SIZE} givens.`)
  }

  if (puzzle.solution.length !== BOARD_SIZE) {
    throw new RangeError(`A puzzle must contain ${BOARD_SIZE} solution cells.`)
  }

  if (!puzzle.givens.every(isGridDigit)) {
    throw new RangeError('Puzzle givens must be integers from 0 through 9.')
  }

  if (
    !puzzle.solution.every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 9,
    )
  ) {
    throw new RangeError('Puzzle solution cells must be integers from 1 through 9.')
  }

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const given = puzzle.givens[index] ?? EMPTY_CELL
    const solution = puzzle.solution[index]
    if (given !== EMPTY_CELL && given !== solution) {
      throw new Error(`Given at cell ${index} does not match the solution.`)
    }
  }
}

export function createCells(puzzle: PuzzleDefinition): CellState[] {
  assertPuzzleDefinition(puzzle)

  return puzzle.givens.map((value) => ({
    value: value === EMPTY_CELL ? null : (value as CellState['value']),
    given: value !== EMPTY_CELL,
    corner: [],
    center: [],
    color: null,
  }))
}

export function createGameState(
  puzzle: PuzzleDefinition,
  options: CreateGameOptions = {},
): GameState {
  const cells = createCells(puzzle)
  const firstEmpty = cells.findIndex((cell) => !cell.given)
  const shouldSelect = options.selectFirstEmpty ?? true
  const anchor = shouldSelect ? firstEmpty : -1
  const startPaused = options.startPaused ?? false
  const now = options.now ?? Date.now()

  return {
    puzzle,
    cells,
    selected: anchor >= 0 ? [anchor] : [],
    anchor,
    activeDigit: null,
    inputMode: 'value',
    history: [],
    future: [],
    elapsedMs: 0,
    lastResumedAt: startPaused ? null : now,
    mistakes: 0,
    hintsUsed: 0,
    hint: null,
    status: startPaused ? 'paused' : 'playing',
    completedAt: null,
  }
}

export function cloneCell(cell: CellState): CellState {
  return {
    value: cell.value,
    given: cell.given,
    corner: [...cell.corner],
    center: [...cell.center],
    color: cell.color,
  }
}

export function cloneCells(cells: readonly CellState[]): CellState[] {
  return cells.map(cloneCell)
}

export function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return {
    cells: cloneCells(snapshot.cells),
    elapsedMs: snapshot.elapsedMs,
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
  }
}

export function snapshotGame(state: GameState): GameSnapshot {
  return {
    cells: cloneCells(state.cells),
    elapsedMs: state.elapsedMs,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  }
}

export function boardFromCells(cells: readonly CellState[]): number[] {
  return cells.map((cell) => cell.value ?? EMPTY_CELL)
}

export function isBoardComplete(state: Pick<GameState, 'cells' | 'puzzle'>): boolean {
  if (state.cells.length !== BOARD_SIZE) return false

  return state.cells.every(
    (cell, index) =>
      cell.value !== null && cell.value === state.puzzle.solution[index],
  )
}

export function isCellIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

export function capSnapshots(
  snapshots: readonly GameSnapshot[],
  maximum: number,
): GameSnapshot[] {
  const safeMaximum = Math.max(0, Math.floor(maximum))
  if (safeMaximum === 0) return []
  const start = Math.max(0, snapshots.length - safeMaximum)
  return snapshots.slice(start).map(cloneSnapshot)
}
