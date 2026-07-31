import { describe, expect, it } from 'vitest'
import { analyzeDifficulty, findHint } from '../../src/engine'
import type {
  CellState,
  PuzzleDefinition,
} from '../../src/domain/types'

const SOLUTION = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

function cellsFor(grid: readonly number[]): CellState[] {
  return grid.map((value) => ({
    value: value === 0 ? null : (value as CellState['value']),
    given: value !== 0,
    corner: [],
    center: [],
    color: null,
  }))
}

function puzzleFor(givens: number[]): PuzzleDefinition {
  return {
    id: 'hint-test',
    seed: 'hint-test',
    variant: 'classic',
    difficulty: 'relaxed',
    givens,
    solution: SOLUTION,
    technique: 'singles',
    generatedAt: 0,
  }
}

describe('progressive hints', () => {
  it('identifies a naked single and reveals it only in later phases', () => {
    const grid = [...SOLUTION]
    grid[80] = 0
    const cells = cellsFor(grid)
    const puzzle = puzzleFor(grid)

    const firstPhase = findHint(cells, puzzle, 1)
    const finalPhase = findHint(cells, puzzle, 4)

    expect(firstPhase).toMatchObject({
      technique: 'naked-single',
      phase: 1,
      cells: [80],
    })
    expect(firstPhase?.digit).toBeUndefined()
    expect(finalPhase).toMatchObject({
      technique: 'naked-single',
      phase: 4,
      cells: [80],
      digit: 9,
    })
  })

  it('surfaces conflicts before suggesting a deduction', () => {
    const grid = [...SOLUTION]
    grid[1] = 5
    grid[80] = 0

    expect(findHint(cellsFor(grid), puzzleFor(grid), 1)).toMatchObject({
      technique: 'conflict',
      phase: 1,
    })
  })

  it('finds a hidden single when no cell has a single candidate', () => {
    const grid = [
      0, 0, 4, 0, 0, 8, 0, 0, 0,
      6, 7, 2, 0, 9, 0, 0, 4, 0,
      0, 0, 0, 0, 0, 0, 5, 6, 0,
      0, 0, 0, 7, 0, 0, 0, 0, 3,
      4, 0, 0, 8, 0, 0, 0, 9, 0,
      0, 0, 0, 0, 0, 4, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 7, 0, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]

    expect(findHint(cellsFor(grid), puzzleFor(grid), 4)).toMatchObject({
      technique: 'hidden-single',
      cells: [33],
      digit: 4,
      phase: 4,
    })
  })

  it('falls back to an honest guided continuation when a grid is non-unique', () => {
    const grid = new Array<number>(81).fill(0)

    expect(findHint(cellsFor(grid), puzzleFor(grid), 1)).toMatchObject({
      technique: 'guided-continuation',
      phase: 1,
    })
  })

  it('explains an advanced logical chain before using search fallback', () => {
    const grid = [
      0, 0, 0, 1, 0, 0, 0, 8, 5,
      7, 1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 2, 0, 8, 0, 4, 0, 0,
      0, 0, 0, 0, 7, 6, 0, 0, 0,
      6, 0, 4, 0, 0, 0, 7, 0, 3,
      0, 0, 3, 2, 1, 0, 0, 0, 0,
      0, 0, 7, 0, 3, 0, 8, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 3, 9,
      0, 8, 0, 0, 0, 2, 5, 0, 0,
    ]
    const analysis = analyzeDifficulty(grid, 'classic')
    const advancedIndex = analysis.steps.findIndex(
      (step) => step.action === 'eliminate',
    )
    expect(advancedIndex).toBeGreaterThan(0)

    const progressed = [...grid]
    for (const step of analysis.steps.slice(0, advancedIndex)) {
      for (const placement of step.placements) {
        progressed[placement.cell] = placement.digit
      }
    }

    const hint = findHint(progressed, 'classic', undefined, 4)
    expect(hint).toMatchObject({
      technique: analysis.steps[advancedIndex]?.technique,
      phase: 4,
    })
    expect(hint?.digit).toBeGreaterThanOrEqual(1)
    expect(hint?.cells).toHaveLength(1)
  })
})
