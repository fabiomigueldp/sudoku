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
  | 'hidden-pair'
  | 'naked-triple'
  | 'hidden-triple'
  | 'naked-quad'
  | 'hidden-quad'
  | 'x-wing'
  | 'skyscraper'
  | 'swordfish'
  | 'xy-wing'
  | 'jellyfish'

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
  'hidden-pair': 11,
  'naked-triple': 14,
  'hidden-triple': 15,
  'naked-quad': 17,
  'hidden-quad': 18,
  'x-wing': 18,
  skyscraper: 22,
  swordfish: 28,
  'xy-wing': 30,
  jellyfish: 40,
}

export const LOGICAL_TECHNIQUE_RANK: Readonly<
  Record<LogicalTechnique, number>
> = {
  'naked-single': 1,
  'hidden-single': 2,
  'locked-candidates-pointing': 3,
  'locked-candidates-claiming': 3,
  'naked-pair': 4,
  'hidden-pair': 4,
  'naked-triple': 5,
  'hidden-triple': 5,
  'naked-quad': 5,
  'hidden-quad': 5,
  'x-wing': 6,
  skyscraper: 6,
  swordfish: 7,
  'xy-wing': 7,
  jellyfish: 8,
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

function combinations<T>(values: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (values.length < size) return []

  const result: T[][] = []
  for (let index = 0; index <= values.length - size; index += 1) {
    const head = values[index] as T
    for (const tail of combinations(values.slice(index + 1), size - 1)) {
      result.push([head, ...tail])
    }
  }
  return result
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

function findNakedSubset(
  state: LogicalState,
  variant: VariantId,
  size: 3 | 4,
  technique: 'naked-triple' | 'naked-quad',
): StepDraft | null {
  for (const unit of unitsFor(variant)) {
    const candidates = unit.filter((cell) => {
      const count = countBits(state.masks[cell] as number)
      return state.grid[cell] === 0 && count >= 2 && count <= size
    })

    for (const pattern of combinations(candidates, size)) {
      const unionMask = pattern.reduce(
        (mask, cell) => mask | (state.masks[cell] as number),
        0,
      )
      if (countBits(unionMask) !== size) continue

      const affected = unit.filter(
        (cell) =>
          state.grid[cell] === 0 &&
          !pattern.includes(cell) &&
          ((state.masks[cell] as number) & unionMask) !== 0,
      )
      if (affected.length === 0) continue

      return makeEliminationStep(
        state,
        technique,
        digitsFromMask(unionMask),
        pattern,
        affected,
        [unit],
      )
    }
  }

  return null
}

function findHiddenSubset(
  state: LogicalState,
  variant: VariantId,
  size: 2 | 3 | 4,
  technique: 'hidden-pair' | 'hidden-triple' | 'hidden-quad',
): StepDraft | null {
  for (const unit of unitsFor(variant)) {
    for (const digits of combinations(ALL_DIGITS, size)) {
      const subsetMask = digits.reduce(
        (mask, digit) => mask | digitMask(digit),
        0,
      )
      const pattern = unit.filter(
        (cell) =>
          state.grid[cell] === 0 &&
          ((state.masks[cell] as number) & subsetMask) !== 0,
      )
      if (pattern.length !== size) continue
      if (
        !digits.every((digit) =>
          pattern.some(
            (cell) =>
              ((state.masks[cell] as number) & digitMask(digit)) !== 0,
          ),
        )
      ) {
        continue
      }

      const eliminations = pattern.flatMap((cell) => {
        const extras = (state.masks[cell] as number) & ~subsetMask
        return extras === 0
          ? []
          : [{ cell, digits: digitsFromMask(extras) }]
      })
      if (eliminations.length === 0) continue

      return {
        technique,
        cells: uniqueSorted(pattern),
        units: [[...unit]],
        eliminations,
      }
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

function findFishByOrientation(
  state: LogicalState,
  digit: Digit,
  size: 3 | 4,
  technique: 'swordfish' | 'jellyfish',
  orientation: 'rows' | 'columns',
): StepDraft | null {
  const baseUnit = orientation === 'rows' ? rowCells : columnCells
  const coverIndex = orientation === 'rows' ? columnOf : rowOf
  const coverUnit = orientation === 'rows' ? columnCells : rowCells
  const baseIndex = orientation === 'rows' ? rowOf : columnOf
  const eligible = Array.from({ length: 9 }, (_, index) => index).filter(
    (index) => {
      const count = cellsWithDigit(state, baseUnit(index), digit).length
      return count >= 2 && count <= size
    },
  )

  for (const baseLines of combinations(eligible, size)) {
    const coverLines = uniqueSorted(
      baseLines.flatMap((line) =>
        cellsWithDigit(state, baseUnit(line), digit).map(coverIndex),
      ),
    )
    if (coverLines.length !== size) continue

    const affected = uniqueSorted(
      coverLines.flatMap((line) =>
        cellsWithDigit(state, coverUnit(line), digit).filter(
          (cell) => !baseLines.includes(baseIndex(cell)),
        ),
      ),
    )
    if (affected.length === 0) continue

    const pattern = baseLines.flatMap((line) =>
      cellsWithDigit(state, baseUnit(line), digit),
    )
    return makeEliminationStep(
      state,
      technique,
      [digit],
      pattern,
      affected,
      [
        ...baseLines.map(baseUnit),
        ...coverLines.map(coverUnit),
      ],
    )
  }

  return null
}

function findFish(
  state: LogicalState,
  size: 3 | 4,
  technique: 'swordfish' | 'jellyfish',
): StepDraft | null {
  for (const digit of ALL_DIGITS) {
    const byRows = findFishByOrientation(
      state,
      digit,
      size,
      technique,
      'rows',
    )
    if (byRows !== null) return byRows

    const byColumns = findFishByOrientation(
      state,
      digit,
      size,
      technique,
      'columns',
    )
    if (byColumns !== null) return byColumns
  }
  return null
}

function commonCandidatePeers(
  state: LogicalState,
  first: number,
  second: number,
  digit: Digit,
  excluded: readonly number[],
  variant: VariantId,
): number[] {
  const secondPeers = new Set(peerView(second, variant))
  const bit = digitMask(digit)
  return peerView(first, variant).filter(
    (cell) =>
      secondPeers.has(cell) &&
      !excluded.includes(cell) &&
      state.grid[cell] === 0 &&
      ((state.masks[cell] as number) & bit) !== 0,
  )
}

function findSkyscraperByOrientation(
  state: LogicalState,
  digit: Digit,
  variant: VariantId,
  orientation: 'rows' | 'columns',
): StepDraft | null {
  const unitFor = orientation === 'rows' ? rowCells : columnCells
  const crossIndex = orientation === 'rows' ? columnOf : rowOf
  const strongLinks = Array.from({ length: 9 }, (_, index) => ({
    index,
    cells: cellsWithDigit(state, unitFor(index), digit),
  })).filter((entry) => entry.cells.length === 2)

  for (const [first, second] of combinations(strongLinks, 2)) {
    if (first === undefined || second === undefined) continue
    const shared = first.cells.filter((firstCell) =>
      second.cells.some(
        (secondCell) => crossIndex(secondCell) === crossIndex(firstCell),
      ),
    )
    if (shared.length !== 1) continue

    const sharedCross = crossIndex(shared[0] as number)
    const firstRoof = first.cells.find(
      (cell) => crossIndex(cell) !== sharedCross,
    )
    const secondRoof = second.cells.find(
      (cell) => crossIndex(cell) !== sharedCross,
    )
    if (firstRoof === undefined || secondRoof === undefined) continue

    const pattern = [...first.cells, ...second.cells]
    const affected = commonCandidatePeers(
      state,
      firstRoof,
      secondRoof,
      digit,
      pattern,
      variant,
    )
    if (affected.length === 0) continue

    return makeEliminationStep(
      state,
      'skyscraper',
      [digit],
      pattern,
      affected,
      [unitFor(first.index), unitFor(second.index)],
    )
  }

  return null
}

function findSkyscraper(
  state: LogicalState,
  variant: VariantId,
): StepDraft | null {
  for (const digit of ALL_DIGITS) {
    const byRows = findSkyscraperByOrientation(
      state,
      digit,
      variant,
      'rows',
    )
    if (byRows !== null) return byRows
    const byColumns = findSkyscraperByOrientation(
      state,
      digit,
      variant,
      'columns',
    )
    if (byColumns !== null) return byColumns
  }
  return null
}

function findXYWing(
  state: LogicalState,
  variant: VariantId,
): StepDraft | null {
  const bivalueCells = Array.from({ length: CELL_COUNT }, (_, cell) => cell)
    .filter(
      (cell) =>
        state.grid[cell] === 0 &&
        countBits(state.masks[cell] as number) === 2,
    )

  for (const pivot of bivalueCells) {
    const pivotMask = state.masks[pivot] as number
    const pivotPeers = new Set(peerView(pivot, variant))
    const wings = bivalueCells.filter(
      (cell) => cell !== pivot && pivotPeers.has(cell),
    )

    for (const [firstWing, secondWing] of combinations(wings, 2)) {
      if (firstWing === undefined || secondWing === undefined) continue
      const firstMask = state.masks[firstWing] as number
      const secondMask = state.masks[secondWing] as number
      const firstPivotDigit = firstMask & pivotMask
      const secondPivotDigit = secondMask & pivotMask
      if (
        countBits(firstPivotDigit) !== 1 ||
        countBits(secondPivotDigit) !== 1 ||
        firstPivotDigit === secondPivotDigit
      ) {
        continue
      }

      const firstOuter = firstMask & ~pivotMask
      const secondOuter = secondMask & ~pivotMask
      if (
        countBits(firstOuter) !== 1 ||
        firstOuter !== secondOuter
      ) {
        continue
      }

      const digit = singleDigit(firstOuter)
      const pattern = [pivot, firstWing, secondWing]
      const affected = commonCandidatePeers(
        state,
        firstWing,
        secondWing,
        digit,
        pattern,
        variant,
      )
      if (affected.length === 0) continue

      return makeEliminationStep(
        state,
        'xy-wing',
        [digit],
        pattern,
        affected,
        [],
      )
    }
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
    findHiddenSubset(state, variant, 2, 'hidden-pair') ??
    findNakedSubset(state, variant, 3, 'naked-triple') ??
    findHiddenSubset(state, variant, 3, 'hidden-triple') ??
    findNakedSubset(state, variant, 4, 'naked-quad') ??
    findHiddenSubset(state, variant, 4, 'hidden-quad') ??
    findXWing(state) ??
    findSkyscraper(state, variant) ??
    findFish(state, 3, 'swordfish') ??
    findXYWing(state, variant) ??
    findFish(state, 4, 'jellyfish')
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
