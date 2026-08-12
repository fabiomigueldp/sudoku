import { describe, expect, it } from 'vitest'
import {
  PRACTICE_TECHNIQUES,
  analyzeDifficulty,
  generatePracticePuzzleInWorker,
  isSolved,
} from '../../src/engine'
import { practiceTechniqueFromPuzzle } from '../../src/game'

describe('technique practice generation', () => {
  it('builds a deterministic, symmetric and correctly focused exercise bank', async () => {
    for (const definition of PRACTICE_TECHNIQUES) {
      const puzzle = await generatePracticePuzzleInWorker(
        definition.id,
        `practice-contract:${definition.id}`,
        { generatedAt: 42 },
      )
      const analysis = analyzeDifficulty(puzzle.givens, puzzle.variant)

      expect(puzzle.generatedAt).toBe(42)
      expect(practiceTechniqueFromPuzzle(puzzle)).toBe(definition.id)
      expect(isSolved(puzzle.solution, 'classic')).toBe(true)
      expect(
        analysis.steps.some((step) => step.technique === definition.id),
      ).toBe(true)
      expect(
        puzzle.givens.every(
          (value, index) =>
            (value === 0) === (puzzle.givens[80 - index] === 0),
        ),
      ).toBe(true)
    }
  }, 30_000)

  it('repeats the same transformed practice for equal inputs', async () => {
    const first = await generatePracticePuzzleInWorker(
      'x-wing',
      'repeat-practice',
      { generatedAt: 7 },
    )
    const second = await generatePracticePuzzleInWorker(
      'x-wing',
      'repeat-practice',
      { generatedAt: 7 },
    )

    expect(second).toEqual(first)
  }, 10_000)
})
