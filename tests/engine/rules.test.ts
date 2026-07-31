import { describe, expect, it } from 'vitest'
import {
  candidatesFor,
  conflictingCells,
  isPlacementValid,
  peersFor,
} from '../../src/engine'

const EMPTY = new Array<number>(81).fill(0)

describe('Sudoku topology and candidates', () => {
  it('builds classic, diagonal, and anti-knight peer sets', () => {
    expect(peersFor(40, 'classic')).toHaveLength(20)
    expect(peersFor(0, 'diagonal')).toHaveLength(26)
    expect(peersFor(40, 'anti-knight')).toHaveLength(28)
  })

  it('computes classic candidates without mutating the grid', () => {
    const grid = [
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
    const snapshot = [...grid]

    expect(candidatesFor(grid, 2, 'classic')).toEqual([1, 2, 4])
    expect(grid).toEqual(snapshot)
  })

  it('enforces the extra diagonal constraint', () => {
    const grid = [...EMPTY]
    grid[0] = 5
    grid[40] = 5

    expect(conflictingCells(grid, 'classic')).toEqual([])
    expect(conflictingCells(grid, 'diagonal')).toEqual([0, 40])
  })

  it('enforces knight moves without inventing classic conflicts', () => {
    const grid = [...EMPTY]
    grid[40] = 5

    expect(candidatesFor(grid, 21, 'classic')).toContain(5)
    expect(candidatesFor(grid, 21, 'anti-knight')).not.toContain(5)
    expect(isPlacementValid(grid, 21, 5, 'classic')).toBe(true)
    expect(isPlacementValid(grid, 21, 5, 'anti-knight')).toBe(false)

    grid[21] = 5
    expect(conflictingCells(grid, 'anti-knight')).toEqual([21, 40])
  })
})
