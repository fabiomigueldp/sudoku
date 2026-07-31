import type { Digit, VariantId } from '../domain/types'

export const GRID_SIDE = 9
export const BOX_SIDE = 3
export const CELL_COUNT = GRID_SIDE * GRID_SIDE
export const ALL_DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const VARIANTS: readonly VariantId[] = ['classic', 'diagonal', 'anti-knight']

function assertVariant(variant: VariantId): void {
  if (!VARIANTS.includes(variant)) {
    throw new RangeError(`Unsupported Sudoku variant: ${String(variant)}`)
  }
}

export function assertCellIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
    throw new RangeError(`Cell index must be between 0 and ${CELL_COUNT - 1}`)
  }
}

export function assertGrid(grid: readonly number[]): void {
  if (grid.length !== CELL_COUNT) {
    throw new RangeError(`A Sudoku grid must contain exactly ${CELL_COUNT} cells`)
  }

  for (const value of grid) {
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      throw new RangeError('Grid values must be integers between 0 and 9')
    }
  }
}

export function rowOf(index: number): number {
  assertCellIndex(index)
  return Math.floor(index / GRID_SIDE)
}

export function columnOf(index: number): number {
  assertCellIndex(index)
  return index % GRID_SIDE
}

export function boxOf(index: number): number {
  const row = rowOf(index)
  const column = columnOf(index)
  return Math.floor(row / BOX_SIDE) * BOX_SIDE + Math.floor(column / BOX_SIDE)
}

function buildClassicUnits(): number[][] {
  const units: number[][] = []

  for (let row = 0; row < GRID_SIDE; row += 1) {
    units.push(Array.from({ length: GRID_SIDE }, (_, column) => row * GRID_SIDE + column))
  }

  for (let column = 0; column < GRID_SIDE; column += 1) {
    units.push(Array.from({ length: GRID_SIDE }, (_, row) => row * GRID_SIDE + column))
  }

  for (let boxRow = 0; boxRow < BOX_SIDE; boxRow += 1) {
    for (let boxColumn = 0; boxColumn < BOX_SIDE; boxColumn += 1) {
      const unit: number[] = []

      for (let rowOffset = 0; rowOffset < BOX_SIDE; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < BOX_SIDE; columnOffset += 1) {
          const row = boxRow * BOX_SIDE + rowOffset
          const column = boxColumn * BOX_SIDE + columnOffset
          unit.push(row * GRID_SIDE + column)
        }
      }

      units.push(unit)
    }
  }

  return units
}

const CLASSIC_UNITS = buildClassicUnits()
const MAIN_DIAGONAL = Array.from(
  { length: GRID_SIDE },
  (_, index) => index * GRID_SIDE + index,
)
const ANTI_DIAGONAL = Array.from(
  { length: GRID_SIDE },
  (_, index) => index * GRID_SIDE + (GRID_SIDE - 1 - index),
)

const UNITS_BY_VARIANT: Record<VariantId, readonly (readonly number[])[]> = {
  classic: CLASSIC_UNITS,
  diagonal: [...CLASSIC_UNITS, MAIN_DIAGONAL, ANTI_DIAGONAL],
  'anti-knight': CLASSIC_UNITS,
}

function buildPeers(variant: VariantId): readonly (readonly number[])[] {
  const peerSets = Array.from({ length: CELL_COUNT }, () => new Set<number>())

  for (const unit of UNITS_BY_VARIANT[variant]) {
    for (const cell of unit) {
      const set = peerSets[cell]
      if (!set) continue

      for (const peer of unit) {
        if (peer !== cell) set.add(peer)
      }
    }
  }

  if (variant === 'anti-knight') {
    const offsets: readonly (readonly [number, number])[] = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]

    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      const row = Math.floor(cell / GRID_SIDE)
      const column = cell % GRID_SIDE
      const set = peerSets[cell]
      if (!set) continue

      for (const [rowOffset, columnOffset] of offsets) {
        const peerRow = row + rowOffset
        const peerColumn = column + columnOffset

        if (
          peerRow >= 0 &&
          peerRow < GRID_SIDE &&
          peerColumn >= 0 &&
          peerColumn < GRID_SIDE
        ) {
          set.add(peerRow * GRID_SIDE + peerColumn)
        }
      }
    }
  }

  return peerSets.map((set) => Object.freeze([...set].sort((left, right) => left - right)))
}

const PEERS_BY_VARIANT: Record<VariantId, readonly (readonly number[])[]> = {
  classic: buildPeers('classic'),
  diagonal: buildPeers('diagonal'),
  'anti-knight': buildPeers('anti-knight'),
}

const CELL_UNITS_BY_VARIANT: Record<
  VariantId,
  readonly (readonly (readonly number[])[])[]
> = {
  classic: Array.from({ length: CELL_COUNT }, (_, cell) =>
    CLASSIC_UNITS.filter((unit) => unit.includes(cell)),
  ),
  diagonal: Array.from({ length: CELL_COUNT }, (_, cell) =>
    UNITS_BY_VARIANT.diagonal.filter((unit) => unit.includes(cell)),
  ),
  'anti-knight': Array.from({ length: CELL_COUNT }, (_, cell) =>
    CLASSIC_UNITS.filter((unit) => unit.includes(cell)),
  ),
}

export function unitsFor(variant: VariantId): readonly (readonly number[])[] {
  assertVariant(variant)
  return UNITS_BY_VARIANT[variant]
}

export function unitsForCell(
  index: number,
  variant: VariantId,
): readonly (readonly number[])[] {
  assertCellIndex(index)
  assertVariant(variant)
  return CELL_UNITS_BY_VARIANT[variant][index] as readonly (readonly number[])[]
}

/** Returns a defensive array so callers cannot mutate the cached topology. */
export function peersFor(index: number, variant: VariantId): number[] {
  assertCellIndex(index)
  assertVariant(variant)
  return [...(PEERS_BY_VARIANT[variant][index] as readonly number[])]
}

/** Internal zero-allocation view used by the solver. */
export function peerView(index: number, variant: VariantId): readonly number[] {
  assertCellIndex(index)
  assertVariant(variant)
  return PEERS_BY_VARIANT[variant][index] as readonly number[]
}

export function isPlacementValid(
  grid: readonly number[],
  index: number,
  digit: Digit,
  variant: VariantId,
): boolean {
  assertGrid(grid)
  assertCellIndex(index)
  assertVariant(variant)

  if (!ALL_DIGITS.includes(digit)) return false

  return (PEERS_BY_VARIANT[variant][index] as readonly number[]).every(
    (peer) => grid[peer] !== digit,
  )
}

export function candidatesFor(
  grid: readonly number[],
  index: number,
  variant: VariantId,
): Digit[] {
  assertGrid(grid)
  assertCellIndex(index)
  assertVariant(variant)

  if (grid[index] !== 0) return []

  const unavailable = new Set<number>()
  for (const peer of PEERS_BY_VARIANT[variant][index] as readonly number[]) {
    const value = grid[peer] as number
    if (value !== 0) unavailable.add(value)
  }

  return ALL_DIGITS.filter((digit) => !unavailable.has(digit))
}

export function candidateMap(
  grid: readonly number[],
  variant: VariantId,
): Digit[][] {
  assertGrid(grid)
  assertVariant(variant)
  return grid.map((_, index) => candidatesFor(grid, index, variant))
}

export function conflictingCells(
  grid: readonly number[],
  variant: VariantId,
): number[] {
  assertGrid(grid)
  assertVariant(variant)
  const conflicts = new Set<number>()

  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const value = grid[cell] as number
    if (value === 0) continue

    for (const peer of PEERS_BY_VARIANT[variant][cell] as readonly number[]) {
      if (peer > cell && grid[peer] === value) {
        conflicts.add(cell)
        conflicts.add(peer)
      }
    }
  }

  return [...conflicts].sort((left, right) => left - right)
}

export function cellConflicts(
  grid: readonly number[],
  index: number,
  variant: VariantId,
): number[] {
  assertGrid(grid)
  assertCellIndex(index)
  assertVariant(variant)
  const value = grid[index] as number
  if (value === 0) return []

  return (PEERS_BY_VARIANT[variant][index] as readonly number[]).filter(
    (peer) => grid[peer] === value,
  )
}

export function isValidGrid(grid: readonly number[], variant: VariantId): boolean {
  try {
    return conflictingCells(grid, variant).length === 0
  } catch {
    return false
  }
}

export function isSolved(grid: readonly number[], variant: VariantId): boolean {
  return (
    grid.length === CELL_COUNT &&
    grid.every((value) => value >= 1 && value <= 9 && Number.isInteger(value)) &&
    isValidGrid(grid, variant)
  )
}
