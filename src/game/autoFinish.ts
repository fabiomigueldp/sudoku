import type { Digit, GameState } from '../domain/types'
import { candidatesFor, conflictingCells, isSolved, unitsFor } from '../engine/topology'

export const AUTO_FINISH_LIMIT = 10

export interface AutoFinishPlacement {
  index: number
  digit: Digit
}

/** Prove the entire finish using singles, never guesses or player pencil marks. */
export function planAutoFinish(
  state: Pick<GameState, 'cells' | 'puzzle' | 'status'>,
): AutoFinishPlacement[] | null {
  if (state.status !== 'playing') return null
  const { cells, puzzle } = state
  const empty = cells.filter((cell) => cell.value === null).length
  if (empty === 0 || empty > AUTO_FINISH_LIMIT) return null
  if (cells.some((cell, index) =>
    (cell.value !== null && cell.value !== puzzle.solution[index]) ||
    (cell.given && cell.value === null),
  )) return null

  const values = cells.map((cell) => cell.value ?? 0)
  if (conflictingCells(values, puzzle.variant).length > 0) return null
  const placements: AutoFinishPlacement[] = []
  while (placements.length < empty) {
    const candidates = values.map((_, index) => candidatesFor(values, index, puzzle.variant))
    if (values.some((value, index) => value === 0 && candidates[index]?.length === 0)) return null
    let next: AutoFinishPlacement | undefined
    const single = candidates.findIndex((digits) => digits.length === 1)
    if (single >= 0) {
      next = { index: single, digit: candidates[single]![0]! }
    } else {
      for (const unit of unitsFor(puzzle.variant)) {
        for (let digit = 1; digit <= 9; digit += 1) {
          const places = unit.filter((index) => candidates[index]?.includes(digit as Digit))
          if (places.length === 1) {
            next = { index: places[0]!, digit: digit as Digit }
            break
          }
        }
        if (next) break
      }
    }
    if (!next || next.digit !== puzzle.solution[next.index]) return null
    values[next.index] = next.digit
    placements.push(next)
  }
  return isSolved(values, puzzle.variant) ? placements : null
}
