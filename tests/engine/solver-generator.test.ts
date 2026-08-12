import { describe, expect, it } from 'vitest'
import {
  analyzeDifficulty,
  countSolutions,
  DIFFICULTY_PROFILES,
  generatePuzzle,
  hasUniqueSolution,
  isSolved,
  LOGICAL_TECHNIQUE_RANK,
  solve,
} from '../../src/engine'
import type { DifficultyId, VariantId } from '../../src/domain/types'

const CLASSIC_PUZZLE = [
  5, 3, 0, 0, 7, 0, 0, 0, 0,
  6, 0, 0, 1, 9, 5, 0, 0, 0,
  0, 9, 8, 0, 0, 0, 0, 6, 0,
  8, 0, 0, 0, 6, 0, 0, 0, 3,
  4, 0, 0, 8, 0, 3, 0, 0, 1,
  7, 0, 0, 0, 2, 0, 0, 0, 6,
  0, 6, 0, 0, 0, 0, 2, 8, 0,
  0, 0, 0, 4, 1, 9, 0, 0, 5,
  0, 0, 0, 0, 8, 0, 0, 7, 9,
]

const CLASSIC_SOLUTION = [
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

function numberOfClues(grid: readonly number[]): number {
  return grid.filter((value) => value !== 0).length
}

describe('exact solver', () => {
  it('solves a known puzzle and proves uniqueness', () => {
    expect(solve(CLASSIC_PUZZLE, 'classic')).toEqual(CLASSIC_SOLUTION)
    expect(countSolutions(CLASSIC_PUZZLE, 'classic')).toBe(1)
    expect(hasUniqueSolution(CLASSIC_PUZZLE, 'classic')).toBe(true)
  })

  it('rejects contradictory givens', () => {
    const invalid = [...CLASSIC_PUZZLE]
    invalid[2] = 5

    expect(solve(invalid, 'classic')).toBeNull()
    expect(countSolutions(invalid, 'classic')).toBe(0)
  })
})

describe('deterministic unique generator', () => {
  it.each<VariantId>(['classic', 'diagonal', 'anti-knight'])(
    'generates a valid unique %s puzzle',
    (variant) => {
      const puzzle = generatePuzzle('variant-contract', variant, 'focused')

      expect(puzzle.givens).toHaveLength(81)
      expect(puzzle.solution).toHaveLength(81)
      expect(isSolved(puzzle.solution, variant)).toBe(true)
      expect(countSolutions(puzzle.givens, variant, 2)).toBe(1)
      expect(
        puzzle.givens.every(
          (value, index) => value === 0 || value === puzzle.solution[index],
        ),
      ).toBe(true)
      expect(puzzle.technique).toBe(
        analyzeDifficulty(puzzle.givens, variant).hardestTechnique,
      )
    },
  )

  it('is deeply deterministic for equal inputs', () => {
    const first = generatePuzzle('repeat-me', 'classic', 'expert')
    const second = generatePuzzle('repeat-me', 'classic', 'expert')

    expect(second).toEqual(first)
  })

  it('maps difficulty to progressively sparser clue profiles', () => {
    const difficulties: DifficultyId[] = [
      'relaxed',
      'focused',
      'challenging',
      'expert',
      'master',
    ]
    const puzzles = difficulties.map((difficulty) =>
      generatePuzzle('difficulty-profile', 'classic', difficulty),
    )
    const counts = puzzles.map((puzzle) => numberOfClues(puzzle.givens))

    expect(counts).toEqual([...counts].sort((left, right) => right - left))
    expect(counts[0]).toBeGreaterThan(counts.at(-1) as number)

    puzzles.forEach((puzzle, index) => {
      const difficulty = difficulties[index] as DifficultyId
      const analysis = analyzeDifficulty(puzzle.givens, 'classic')
      const technique = analysis.hardestTechnique
      const rank =
        technique === 'none' ||
        technique === 'invalid' ||
        technique === 'search-required'
          ? -1
          : LOGICAL_TECHNIQUE_RANK[technique]

      expect(analysis.solvedLogically).toBe(true)
      expect(rank).toBeGreaterThanOrEqual(
        DIFFICULTY_PROFILES[difficulty].rankRange[0],
      )
      expect(rank).toBeLessThanOrEqual(
        DIFFICULTY_PROFILES[difficulty].rankRange[1],
      )
      expect(
        puzzle.givens.every(
          (value, cell) =>
            (value === 0) === (puzzle.givens[80 - cell] === 0),
        ),
      ).toBe(true)
    })
  }, 20_000)

  it('uses the measured human solve path, not a generic density label', () => {
    const relaxed = generatePuzzle('human-rating', 'classic', 'relaxed')
    const master = generatePuzzle('human-rating', 'classic', 'master')
    const relaxedAnalysis = analyzeDifficulty(relaxed.givens, 'classic')
    const masterAnalysis = analyzeDifficulty(master.givens, 'classic')

    expect(relaxed.technique).toBe(relaxedAnalysis.hardestTechnique)
    expect(master.technique).toBe(masterAnalysis.hardestTechnique)
    expect(['singles', 'hidden-singles', 'intersections', 'subsets', 'advanced'])
      .not.toContain(master.technique)
    expect(masterAnalysis.score).toBeGreaterThan(relaxedAnalysis.score)
  })
})
