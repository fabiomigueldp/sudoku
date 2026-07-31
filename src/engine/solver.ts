import type { Digit, VariantId } from '../domain/types'
import type { SeededRandom } from './random'
import {
  ALL_DIGITS,
  assertGrid,
  conflictingCells,
  isSolved,
  peerView,
} from './topology'

const FULL_DIGIT_MASK = 0b11_1111_1110

export interface SolveOptions {
  /** Supplying a seeded source randomizes branching while remaining reproducible. */
  random?: SeededRandom
}

export interface SolutionAnalysis {
  solution: number[] | null
  count: number
  unique: boolean
}

interface SearchResult {
  count: number
  first: number[] | null
}

function maskForCell(
  grid: readonly number[],
  index: number,
  variant: VariantId,
): number {
  let mask = FULL_DIGIT_MASK

  for (const peer of peerView(index, variant)) {
    const value = grid[peer] as number
    if (value !== 0) mask &= ~(1 << value)
  }

  return mask
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
  const digits: Digit[] = []

  for (const digit of ALL_DIGITS) {
    if ((mask & (1 << digit)) !== 0) digits.push(digit)
  }

  return digits
}

/**
 * Exact depth-first search with MRV branching. It stops at `limit`, which keeps
 * uniqueness checks cheap without changing their answer.
 */
function search(
  input: readonly number[],
  variant: VariantId,
  limit: number,
  random?: SeededRandom,
): SearchResult {
  const grid = [...input]
  let solutionCount = 0
  let firstSolution: number[] | null = null

  function visit(): void {
    if (solutionCount >= limit) return

    let selectedCell = -1
    let selectedMask = 0
    let selectedCount = 10
    let tieCount = 0

    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] !== 0) continue

      const mask = maskForCell(grid, index, variant)
      const candidateCount = countBits(mask)

      if (candidateCount === 0) return

      if (candidateCount < selectedCount) {
        selectedCell = index
        selectedMask = mask
        selectedCount = candidateCount
        tieCount = 1
      } else if (candidateCount === selectedCount && random) {
        tieCount += 1
        // Reservoir sampling avoids allocating a list of all tied cells.
        if (random.integer(tieCount) === 0) {
          selectedCell = index
          selectedMask = mask
        }
      }
    }

    if (selectedCell === -1) {
      solutionCount += 1
      if (firstSolution === null) firstSolution = [...grid]
      return
    }

    const orderedDigits = digitsFromMask(selectedMask)
    const digits = random ? random.shuffle(orderedDigits) : orderedDigits

    for (const digit of digits) {
      grid[selectedCell] = digit
      visit()
      grid[selectedCell] = 0

      if (solutionCount >= limit) return
    }
  }

  visit()
  return { count: solutionCount, first: firstSolution }
}

function validateLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Solution limit must be a positive safe integer')
  }
}

export function analyzeSolutions(
  grid: readonly number[],
  variant: VariantId = 'classic',
  limit = 2,
  options: SolveOptions = {},
): SolutionAnalysis {
  assertGrid(grid)
  validateLimit(limit)

  if (conflictingCells(grid, variant).length > 0) {
    return { solution: null, count: 0, unique: false }
  }

  const result = search(grid, variant, limit, options.random)
  return {
    solution: result.first,
    count: result.count,
    // Reaching the limit means the search may have stopped before discovering
    // another solution. A count below the limit proves the tree was exhausted.
    unique: result.count === 1 && result.count < limit,
  }
}

export function solve(
  grid: readonly number[],
  variant: VariantId = 'classic',
  options: SolveOptions = {},
): number[] | null {
  return analyzeSolutions(grid, variant, 1, options).solution
}

export function countSolutions(
  grid: readonly number[],
  variant: VariantId = 'classic',
  limit = 2,
): number {
  return analyzeSolutions(grid, variant, limit).count
}

export function hasUniqueSolution(
  grid: readonly number[],
  variant: VariantId = 'classic',
): boolean {
  return countSolutions(grid, variant, 2) === 1
}

export function solutionMatches(
  grid: readonly number[],
  solution: readonly number[],
  variant: VariantId,
): boolean {
  assertGrid(grid)
  assertGrid(solution)

  return (
    isSolved(solution, variant) &&
    grid.every((value, index) => value === 0 || value === solution[index])
  )
}
