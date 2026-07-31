import type { PuzzleDefinition } from '../../src/domain/types'

export const SOLUTION = Array.from({ length: 81 }, (_, index) => {
  const row = Math.floor(index / 9)
  const column = index % 9
  return ((row * 3 + Math.floor(row / 3) + column) % 9) + 1
})

export function puzzleWithGivens(
  givens: number[] = Array<number>(81).fill(0),
  id = 'test-puzzle',
): PuzzleDefinition {
  return {
    id,
    seed: `seed:${id}`,
    variant: 'classic',
    difficulty: 'focused',
    givens: [...givens],
    solution: [...SOLUTION],
    technique: 'test',
    generatedAt: 0,
  }
}
