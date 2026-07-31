import { describe, expect, it } from 'vitest'
import {
  analyzeDifficulty,
  findNextLogicalStep,
  solveLogically,
} from '../../src/engine'

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

// Fixed, uniquely generated boards make these regression tests independent
// from future generator tuning.
const ADVANCED_GRID = [
  0, 0, 0, 7, 2, 5, 3, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 7,
  2, 0, 0, 0, 4, 3, 0, 0, 1,
  0, 5, 0, 0, 0, 0, 0, 1, 0,
  0, 9, 0, 0, 6, 2, 0, 4, 0,
  0, 6, 0, 0, 0, 0, 0, 5, 3,
  6, 0, 0, 1, 7, 0, 0, 0, 2,
  7, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 3, 0, 5, 4, 0, 0, 0,
]

const X_WING_GRID = [
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

describe('deterministic human solver', () => {
  it('records a complete naked-single solve as a structured placement', () => {
    const grid = [...SOLUTION]
    grid[80] = 0

    const analysis = analyzeDifficulty(grid, 'classic')

    expect(analysis).toMatchObject({
      score: 1,
      hardestTechnique: 'naked-single',
      solvedLogically: true,
    })
    expect(analysis.steps).toEqual([
      {
        technique: 'naked-single',
        action: 'place',
        digits: [9],
        cells: [80],
        affectedCells: [80],
        units: [],
        placements: [{ cell: 80, digit: 9 }],
        eliminations: [],
        score: 1,
      },
    ])
    expect(findNextLogicalStep(grid, 'classic')).toEqual(analysis.steps[0])
    expect(solveLogically(grid, 'classic').grid).toEqual(SOLUTION)
  })

  it('detects intersections and naked pairs with explicit eliminations', () => {
    const first = analyzeDifficulty(ADVANCED_GRID, 'classic')
    const second = analyzeDifficulty(ADVANCED_GRID, 'classic')
    const techniques = new Set(first.steps.map((step) => step.technique))

    expect(second).toEqual(first)
    expect([...techniques]).toEqual(
      expect.arrayContaining([
        'locked-candidates-pointing',
        'locked-candidates-claiming',
        'naked-pair',
      ]),
    )

    for (const step of first.steps.filter((entry) => entry.action === 'eliminate')) {
      expect(step.placements).toEqual([])
      expect(step.eliminations.length).toBeGreaterThan(0)
      expect(step.eliminations.map((entry) => entry.cell)).toEqual(
        step.affectedCells,
      )
      expect(step.eliminations.every((entry) => entry.digits.length > 0)).toBe(true)
    }
  })

  it('recognizes a row-based X-Wing and its exact candidate removals', () => {
    const analysis = analyzeDifficulty(X_WING_GRID, 'classic')
    const xWing = analysis.steps.find((step) => step.technique === 'x-wing')

    expect(xWing).toMatchObject({
      action: 'eliminate',
      digits: [6],
      cells: [19, 21, 55, 57],
      affectedCells: [1, 12],
      eliminations: [
        { cell: 1, digits: [6] },
        { cell: 12, digits: [6] },
      ],
      score: 18,
    })
    expect(analysis.hardestTechnique).toBe('x-wing')
    expect(analysis.solvedLogically).toBe(false)
  })

  it('reports stalls and invalid boards honestly', () => {
    const empty = analyzeDifficulty(new Array<number>(81).fill(0), 'classic')
    expect(empty).toMatchObject({
      hardestTechnique: 'none',
      steps: [],
      solvedLogically: false,
      score: 262,
    })

    const invalid = [...SOLUTION]
    invalid[1] = 5
    const invalidAnalysis = analyzeDifficulty(invalid, 'classic')
    expect(invalidAnalysis.hardestTechnique).toBe('invalid')
    expect(invalidAnalysis.solvedLogically).toBe(false)
    expect(invalidAnalysis.score).toBe(Number.POSITIVE_INFINITY)
  })
})
