import type { Digit, VariantId } from '../domain/types'
import {
  ALL_DIGITS,
  CELL_COUNT,
  assertGrid,
  boxOf,
  columnOf,
  conflictingCells,
  isSolved,
  peerView,
  rowOf,
  unitsFor,
} from './topology'

const FULL_DIGIT_MASK = 0b11_1111_1110

export type LogicalTechnique =
  | 'naked-single'
  | 'hidden-single'
  | 'locked-candidates-pointing'
  | 'locked-candidates-claiming'
  | 'naked-pair'
  | 'x-wing'

export type DifficultyTechnique =
  | LogicalTechnique
  | 'none'
  | 'search-required'
  | 'invalid'

export interface LogicalPlacement {
  readonly cell: number
  readonly digit: Digit
}

export interface LogicalElimination {
  readonly cell: number
  readonly digits: Digit[]
}

/**
 * A logical step records both the pattern that justifies a deduction and the
 * exact state change. `cells` are the pattern cells, while `affectedCells`
 * are the cells changed by the deduction. This distinction lets a UI explain
 * techniques without reverse engineering the solver.
 */
export interface LogicalStep {
  readonly technique: LogicalTechnique
  readonly action: 'place' | 'eliminate'
  readonly digits: Digit[]
  readonly cells: number[]
  readonly affectedCells: number[]
  readonly units: number[][]
  readonly placements: LogicalPlacement[]
  readonly eliminations: LogicalElimination[]
  readonly score: number
}

export interface LogicalSolveResult {
  readonly score: number
  readonly hardestTechnique: DifficultyTechnique
  readonly steps: LogicalStep[]
  readonly solvedLogically: boolean
  readonly grid: number[]
  readonly remainingCells: number
}

export interface DifficultyAnalysis {
  readonly score: number
  readonly hardestTechnique: DifficultyTechnique
  readonly steps: LogicalStep[]
  readonly solvedLogically: boolean
}

interface LogicalState {
  grid: number[]
  masks: number[]
}

interface StepDraft {
  technique: LogicalTechnique
  cells: number[]
  units: number[][]
  placements?: LogicalPlacement[]
  eliminations?: LogicalElimination[]
}

const TECHNIQUE_SCORE: Readonly<Record<LogicalTechnique, number>> = {
  'naked-single': 1,
  'hidden-single': 3,
  'locked-candidates-pointing': 6,
  'locked-candidates-claiming': 7,
  'naked-pair': 10,
  'x-wing': 18,
}

export const LOGICAL_TECHNIQUE_RANK: Readonly<
  Record<LogicalTechnique, number>
> = {
  'naked-single': 1,
  'hidden-single': 2,
  'locked-candidates-pointing': 3,
  'locked-candidates-claiming': 3,
  'naked-pair': 4,
  'x-wing': 5,
}

function digitMask(digit: Digit): number {
  return 1 << digit
}

function countBits(value: number): number {
  let remaining = value
  let count = 0

  while (remaining !== 0) {
    remaining &= remaining - 1
    count += 1
  }

  return count
}

function digitsFromMask(mask: number): Digit[] {
  return ALL_DIGITS.filter((digit) => (mask & digitMask(digit)) !== 0)
}

function singleDigit(mask: number): Digit {
  return ALL_DIGITS.find((digit) => (mask & digitMask(digit)) !== 0) as Digit
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

function createState(grid: readonly number[], variant: VariantId): LogicalState {
  const state: LogicalState = {
    grid: [...grid],
    masks: new Array<number>(CELL_COUNT).fill(0),
  }

  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    if (state.grid[cell] !== 0) continue

    let mask = FULL_DIGIT_MASK
    for (const peer of peerView(cell, variant)) {
      const value = state.grid[peer] as number
      if (value !== 0) mask &= ~(1 << value)
    }
    state.masks[cell] = mask
  }

  return state
}

function placementStep(
  technique: LogicalTechnique,
  cell: number,
  digit: Digit,
  patternCells: readonly number[],
  units: readonly (readonly number[])[],
): StepDraft {
  return {
    technique,
    cells: uniqueSorted(patternCells),
    units: units.map((unit) => [...unit]),
    placements: [{ cell, digit }],
  }
}

function makeEliminationStep(
  state: LogicalState,
  technique: LogicalTechnique,
  digits: readonly Digit[],
  patternCells: readonly number[],
  affectedCells: readonly number[],
  units: readonly (readonly number[])[],
): StepDraft {
  const sortedDigits = [...digits].sort((left, right) => left - right)
  return {
    technique,
    cells: uniqueSorted(patternCells),
    units: units.map((unit) => [...unit]),
    eliminations: uniqueSorted(affectedCells).map((cell) => ({
      cell,
      digits: sortedDigits.filter(
        (digit) => ((state.masks[cell] as number) & digitMask(digit)) !== 0,
      ),
    })),
  }
}

function findNakedSingle(state: LogicalState): StepDraft | null {
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const mask = state.masks[cell] as number
    if (state.grid[cell] === 0 && countBits(mask) === 1) {
      return placementStep(
        'naked-single',
        cell,
        singleDigit(mask),
        [cell],
        [],
      )
    }
  }

  return null
}

function findHiddenSingle(
  state: LogicalState,
  variant: VariantId,
): StepDraft | null {
  for (const unit of unitsFor(variant)) {
    for (const digit of ALL_DIGITS) {
      if (unit.some((cell) => state.grid[cell] === digit)) continue
      const bit = digitMask(digit)
      const possible = unit.filter(
        (cell) => state.grid[cell] === 0 && ((state.masks[cell] as number) & bit) !== 0,
      )

      if (possible.length === 1) {
        const cell = possible[0] as number
        return placementStep(
          'hidden-single',
          cell,
          digit,
          [cell],
          [unit],
        )
      }
    }
  }

  return null
}

function boxCells(box: number): number[] {
  const firstRow = Math.floor(box / 3) * 3
  const firstColumn = (box % 3) * 3
  const cells: number[] = []

  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
      cells.push((firstRow + rowOffset) * 9 + firstColumn + columnOffset)
    }
  }
  return cells
}

function rowCells(row: number): number[] {
  return Array.from({ length: 9 }, (_, column) => row * 9 + column)
}

function columnCells(column: number): number[] {
  return Array.from({ length: 9 }, (_, row) => row * 9 + column)
}

function cellsWithDigit(
  state: LogicalState,
  cells: readonly number[],
  digit: Digit,
): number[] {
  const bit = digitMask(digit)
  return cells.filter(
    (cell) => state.grid[cell] === 0 && ((state.masks[cell] as number) & bit) !== 0,
  )
}

function findPointing(state: LogicalState): StepDraft | null {
  for (let box = 0; box < 9; box += 1) {
    const boxUnit = boxCells(box)

    for (const digit of ALL_DIGITS) {
      const pattern = cellsWithDigit(state, boxUnit, digit)
      if (pattern.length < 2) continue

      const row = rowOf(pattern[0] as number)
      if (pattern.every((cell) => rowOf(cell) === row)) {
        const rowUnit = rowCells(row)
        const affected = cellsWithDigit(state, rowUnit, digit).filter(
          (cell) => boxOf(cell) !== box,
        )
        if (affected.length > 0) {
          return makeEliminationStep(
            state,
            'locked-candidates-pointing',
            [digit],
            pattern,
            affected,
            [boxUnit, rowUnit],
          )
        }
      }

      const column = columnOf(pattern[0] as number)
      if (pattern.every((cell) => columnOf(cell) === column)) {
        const columnUnit = columnCells(column)
        const affected = cellsWithDigit(state, columnUnit, digit).filter(
          (cell) => boxOf(cell) !== box,
        )
        if (affected.length > 0) {
          return makeEliminationStep(
            state,
            'locked-candidates-pointing',
            [digit],
            pattern,
            affected,
            [boxUnit, columnUnit],
          )
        }
      }
    }
  }

  return null
}

function findClaiming(state: LogicalState): StepDraft | null {
  const lineUnits = [
    ...Array.from({ length: 9 }, (_, index) => ({
      cells: rowCells(index),
      lineIndex: index,
      kind: 'row' as const,
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      cells: columnCells(index),
      lineIndex: index,
      kind: 'column' as const,
    })),
  ]

  for (const line of lineUnits) {
    for (const digit of ALL_DIGITS) {
      const pattern = cellsWithDigit(state, line.cells, digit)
      if (pattern.length < 2) continue

      const box = boxOf(pattern[0] as number)
      if (!pattern.every((cell) => boxOf(cell) === box)) continue

      const boxUnit = boxCells(box)
      const affected = cellsWithDigit(state, boxUnit, digit).filter((cell) =>
        line.kind === 'row'
          ? rowOf(cell) !== line.lineIndex
          : columnOf(cell) !== line.lineIndex,
      )

      if (affected.length > 0) {
        return makeEliminationStep(
          state,
          'locked-candidates-claiming',
          [digit],
          pattern,
          affected,
          [line.cells, boxUnit],
        )
      }
    }
  }

  return null
}

function findNakedPair(
  state: LogicalState,
  variant: VariantId,
): StepDraft | null {
  for (const unit of unitsFor(variant)) {
    const pairCells = unit.filter(
      (cell) => state.grid[cell] === 0 && countBits(state.masks[cell] as number) === 2,
    )
    const groups = new Map<number, number[]>()

    for (const cell of pairCells) {
      const mask = state.masks[cell] as number
      const group = groups.get(mask)
      if (group === undefined) groups.set(mask, [cell])
      else group.push(cell)
    }

    for (const [mask, pattern] of groups) {
      if (pattern.length !== 2) continue
      const affected = unit.filter(
        (cell) =>
          state.grid[cell] === 0 &&
          !pattern.includes(cell) &&
          ((state.masks[cell] as number) & mask) !== 0,
      )
      if (affected.length === 0) continue

      return makeEliminationStep(
        state,
        'naked-pair',
        digitsFromMask(mask),
        pattern,
        affected,
        [unit],
      )
    }
  }

  return null
}

function findXWingByRows(
  state: LogicalState,
  digit: Digit,
): StepDraft | null {
  const patterns = new Map<string, { rows: number[]; columns: number[] }>()

  for (let row = 0; row < 9; row += 1) {
    const candidates = cellsWithDigit(state, rowCells(row), digit)
    if (candidates.length !== 2) continue
    const columns = candidates.map(columnOf)
    const key = `${columns[0]}:${columns[1]}`
    const existing = patterns.get(key)
    if (existing === undefined) patterns.set(key, { rows: [row], columns })
    else existing.rows.push(row)
  }

  for (const { rows, columns } of patterns.values()) {
    if (rows.length !== 2) continue
    const affected: number[] = []

    for (const column of columns) {
      affected.push(
        ...cellsWithDigit(state, columnCells(column as number), digit).filter(
          (cell) => !rows.includes(rowOf(cell)),
        ),
      )
    }
    if (affected.length === 0) continue

    const pattern = rows.flatMap((row) =>
      columns.map((column) => row * 9 + (column as number)),
    )
    return makeEliminationStep(
      state,
      'x-wing',
      [digit],
      pattern,
      affected,
      [
        ...rows.map(rowCells),
        ...columns.map((column) => columnCells(column as number)),
      ],
    )
  }

  return null
}

function findXWingByColumns(
  state: LogicalState,
  digit: Digit,
): StepDraft | null {
  const patterns = new Map<string, { columns: number[]; rows: number[] }>()

  for (let column = 0; column < 9; column += 1) {
    const candidates = cellsWithDigit(state, columnCells(column), digit)
    if (candidates.length !== 2) continue
    const rows = candidates.map(rowOf)
    const key = `${rows[0]}:${rows[1]}`
    const existing = patterns.get(key)
    if (existing === undefined) patterns.set(key, { columns: [column], rows })
    else existing.columns.push(column)
  }

  for (const { columns, rows } of patterns.values()) {
    if (columns.length !== 2) continue
    const affected: number[] = []

    for (const row of rows) {
      affected.push(
        ...cellsWithDigit(state, rowCells(row as number), digit).filter(
          (cell) => !columns.includes(columnOf(cell)),
        ),
      )
    }
    if (affected.length === 0) continue

    const pattern = columns.flatMap((column) =>
      rows.map((row) => (row as number) * 9 + column),
    )
    return makeEliminationStep(
      state,
      'x-wing',
      [digit],
      pattern,
      affected,
      [
        ...columns.map(columnCells),
        ...rows.map((row) => rowCells(row as number)),
      ],
    )
  }

  return null
}

function findXWing(state: LogicalState): StepDraft | null {
  for (const digit of ALL_DIGITS) {
    const byRows = findXWingByRows(state, digit)
    if (byRows !== null) return byRows
    const byColumns = findXWingByColumns(state, digit)
    if (byColumns !== null) return byColumns
  }

  return null
}

function nextStep(
  state: LogicalState,
  variant: VariantId,
): StepDraft | null {
  return (
    findNakedSingle(state) ??
    findHiddenSingle(state, variant) ??
    findPointing(state) ??
    findClaiming(state) ??
    findNakedPair(state, variant) ??
    findXWing(state)
  )
}

function applyStep(
  state: LogicalState,
  draft: StepDraft,
  variant: VariantId,
): LogicalStep | null {
  const placements = draft.placements ?? []
  const eliminations = (draft.eliminations ?? []).filter(
    (elimination) => elimination.digits.length > 0,
  )

  for (const placement of placements) {
    if (state.grid[placement.cell] !== 0) return null
    if (
      ((state.masks[placement.cell] as number) & digitMask(placement.digit)) ===
      0
    ) {
      return null
    }

    state.grid[placement.cell] = placement.digit
    state.masks[placement.cell] = 0
    const bit = digitMask(placement.digit)
    for (const peer of peerView(placement.cell, variant)) {
      state.masks[peer] = (state.masks[peer] as number) & ~bit
    }
  }

  for (const elimination of eliminations) {
    let mask = state.masks[elimination.cell] as number
    for (const digit of elimination.digits) mask &= ~digitMask(digit)
    state.masks[elimination.cell] = mask
  }

  const affectedCells = uniqueSorted([
    ...placements.map((placement) => placement.cell),
    ...eliminations.map((elimination) => elimination.cell),
  ])
  if (affectedCells.length === 0) return null

  const digits = uniqueSorted([
    ...placements.map((placement) => placement.digit),
    ...eliminations.flatMap((elimination) => elimination.digits),
  ]) as Digit[]

  return {
    technique: draft.technique,
    action: placements.length > 0 ? 'place' : 'eliminate',
    digits,
    cells: [...draft.cells],
    affectedCells,
    units: draft.units.map((unit) => [...unit]),
    placements: placements.map((placement) => ({ ...placement })),
    eliminations: eliminations.map((elimination) => ({
      cell: elimination.cell,
      digits: [...elimination.digits],
    })),
    score: TECHNIQUE_SCORE[draft.technique],
  }
}

function hasContradiction(state: LogicalState): boolean {
  return state.grid.some(
    (value, cell) => value === 0 && (state.masks[cell] as number) === 0,
  )
}

/**
 * Solves only with named human techniques. It never branches, guesses, or
 * consults the exact solution, so the result is suitable for fair ratings and
 * explainable hints.
 */
export function solveLogically(
  grid: readonly number[],
  variant: VariantId = 'classic',
): LogicalSolveResult {
  assertGrid(grid)
  if (conflictingCells(grid, variant).length > 0) {
    return {
      score: Number.POSITIVE_INFINITY,
      hardestTechnique: 'invalid',
      steps: [],
      solvedLogically: false,
      grid: [...grid],
      remainingCells: grid.filter((value) => value === 0).length,
    }
  }

  const state = createState(grid, variant)
  const steps: LogicalStep[] = []
  let hardestTechnique: DifficultyTechnique = 'none'
  let hardestRank = 0
  let score = 0

  while (!isSolved(state.grid, variant) && !hasContradiction(state)) {
    const draft = nextStep(state, variant)
    if (draft === null) break
    const step = applyStep(state, draft, variant)
    if (step === null) break

    steps.push(step)
    score += step.score
    const rank = LOGICAL_TECHNIQUE_RANK[step.technique]
    if (rank > hardestRank) {
      hardestRank = rank
      hardestTechnique = step.technique
    }
  }

  const solvedLogically = isSolved(state.grid, variant)
  const remainingCells = state.grid.filter((value) => value === 0).length
  if (!solvedLogically) {
    const contradiction = hasContradiction(state)
    if (contradiction) hardestTechnique = 'invalid'
    score = contradiction
      ? Number.POSITIVE_INFINITY
      : score + 100 + remainingCells * 2
  }

  return {
    score,
    hardestTechnique,
    steps,
    solvedLogically,
    grid: [...state.grid],
    remainingCells,
  }
}

export function analyzeDifficulty(
  grid: readonly number[],
  variant: VariantId = 'classic',
): DifficultyAnalysis {
  const result = solveLogically(grid, variant)
  return {
    score: result.score,
    hardestTechnique: result.hardestTechnique,
    steps: result.steps,
    solvedLogically: result.solvedLogically,
  }
}

/**
 * Returns the first deterministic human deduction for the current raw grid.
 * For a complete chain (including candidate eliminations), use solveLogically.
 */
export function findNextLogicalStep(
  grid: readonly number[],
  variant: VariantId = 'classic',
): LogicalStep | null {
  assertGrid(grid)
  if (conflictingCells(grid, variant).length > 0 || isSolved(grid, variant)) {
    return null
  }

  const state = createState(grid, variant)
  const draft = nextStep(state, variant)
  return draft === null ? null : applyStep(state, draft, variant)
}
