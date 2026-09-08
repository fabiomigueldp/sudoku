import { describe, expect, it } from 'vitest'
import {
  analyzeDifficulty, countSolutions, DAILY_SCHEDULE, dailyProfile, dailySeed,
  DIFFICULTY_PROFILES, generatePuzzle, isSolved, LOGICAL_TECHNIQUE_RANK, matchesDailySeed,
} from '../../src/engine'
import type { PuzzleDefinition } from '../../src/domain/types'
import { GENERATION_RESERVES, reserveCandidates } from '../../src/engine/generationReserves'

function expectRatedPuzzle(puzzle: Pick<PuzzleDefinition, 'givens' | 'solution' | 'variant' | 'difficulty'>) {
  const { givens, solution, variant, difficulty } = puzzle
  const profile = DIFFICULTY_PROFILES[difficulty]
  const analysis = analyzeDifficulty(givens, variant)
  expect(isSolved(solution, variant)).toBe(true)
  expect(countSolutions(givens, variant, 2)).toBe(1)
  expect(givens.every((value, index) => value === 0 || value === solution[index])).toBe(true)
  expect(givens.every((value, index) => (value === 0) === (givens[80 - index] === 0))).toBe(true)
  expect(analysis.solvedLogically).toBe(true)
  const rank = LOGICAL_TECHNIQUE_RANK[analysis.hardestTechnique as keyof typeof LOGICAL_TECHNIQUE_RANK]
  expect(rank).toBeGreaterThanOrEqual(profile.rankRange[0])
  expect(rank).toBeLessThanOrEqual(profile.rankRange[1])
  const clues = givens.filter(Boolean).length
  expect(clues).toBeGreaterThanOrEqual(profile.clueRange[0])
  expect(clues).toBeLessThanOrEqual(profile.clueRange[1])
}

it('opens the September 8 daily with a unique, logically solvable diagonal puzzle', () => {
  // Exact production seed that exhausted all 56 carving attempts in v3.
  const seed = 'absolute-sudoku:daily:v2:g3:2026-09-08:diagonal:challenging'
  const puzzle = generatePuzzle(seed, 'diagonal', 'challenging')
  expectRatedPuzzle(puzzle)
  expect(puzzle.seed).toBe(seed)
  expect(generatePuzzle(seed, 'diagonal', 'challenging')).toEqual(puzzle)
}, 30_000)

describe('daily calendar and recovery', () => {
  it('uses one local calendar day for the schedule and seed', () => {
    const midnight = new Date(2026, 8, 8, 0, 0)
    const evening = new Date(2026, 8, 8, 23, 59)
    expect(dailyProfile(midnight)).toEqual({ variant: 'diagonal', difficulty: 'challenging' })
    expect(dailyProfile(evening)).toEqual(dailyProfile(midnight))
    expect(dailyProfile('2026-09-08')).toEqual(dailyProfile(midnight))
    expect(() => dailyProfile('2026-02-30')).toThrow()
  })

  it('recognizes existing attempts across generator upgrades without mixing days or modes', () => {
    expect(matchesDailySeed('absolute-sudoku:daily:v2:g3:2026-09-08:diagonal:challenging',
      '2026-09-08', 'diagonal', 'challenging')).toBe(true)
    expect(matchesDailySeed(dailySeed('2026-09-08', 'diagonal', 'challenging'),
      '2026-09-08', 'diagonal', 'challenging')).toBe(true)
    for (const seed of [
      'absolute-sudoku:daily:v2:g3:2026-09-07:diagonal:challenging',
      'absolute-sudoku:daily:v2:g3:2026-09-08:classic:challenging',
      'absolute-sudoku:daily:v2:g3:2026-09-08:diagonal:focused',
      'absolute-sudoku:daily:v2:g3:extra:2026-09-08:diagonal:challenging',
    ]) expect(matchesDailySeed(seed, '2026-09-08', 'diagonal', 'challenging')).toBe(false)
  })

  it.each(DAILY_SCHEDULE)('has a rated reserve for $variant $difficulty', ({ variant, difficulty }) => {
    const reserve = GENERATION_RESERVES.find((entry) => entry.variant === variant && entry.difficulty === difficulty)!
    const candidates = [...reserveCandidates('reserve-contract', variant, difficulty)]
    expect(candidates).toHaveLength(17)
    expect(candidates).toEqual([...reserveCandidates('reserve-contract', variant, difficulty)])
    expect(candidates[0]).not.toEqual([...reserveCandidates('another-day', variant, difficulty)][0])
    expectRatedPuzzle({ ...reserve, givens: Array.from(reserve.givens, Number), solution: Array.from(reserve.solution, Number) })
    expectRatedPuzzle({ ...candidates.at(-1)!, variant, difficulty })
    for (const candidate of candidates) {
      expect(isSolved(candidate.solution, variant)).toBe(true)
      expect(countSolutions(candidate.givens, variant, 2)).toBe(1)
      expect(candidate.givens.every((value, index) => (value === 0) === (candidate.givens[80 - index] === 0))).toBe(true)
    }
  })

  it.each(Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`))(
    'generates the scheduled challenge for %s', (date) => {
      const { variant, difficulty } = dailyProfile(date)
      const puzzle = generatePuzzle(dailySeed(date, variant, difficulty), variant, difficulty)
      expectRatedPuzzle(puzzle)
    }, 30_000,
  )
})
