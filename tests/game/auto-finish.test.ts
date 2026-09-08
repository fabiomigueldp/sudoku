import { describe, expect, it } from 'vitest'
import type { Digit } from '../../src/domain/types'
import { planAutoFinish } from '../../src/game/autoFinish'
import { createGameState } from '../../src/game/state'
import { reduceGame } from '../../src/game/reducer'
import { createEventLog, reduceAndRecord, replayEventLog } from '../../src/game/events'
import { buildReviewFrames } from '../../src/game/review'
import { solve } from '../../src/engine/solver'
import { puzzleWithGivens, SOLUTION } from './fixture'

function endgame(count = 10) {
  const state = createGameState(puzzleWithGivens(), { now: 1000 })
  state.cells.forEach((cell, index) => {
    cell.value = index < count ? null : SOLUTION[index] as Digit
  })
  return state
}

describe('automatic finish', () => {
  it.each(['diagonal', 'anti-knight'] as const)('respects %s rules', (variant) => {
    const solution = solve(Array<number>(81).fill(0), variant)!
    const state = endgame()
    state.puzzle.variant = variant
    state.puzzle.solution = solution
    state.cells.forEach((cell, index) => {
      cell.value = index < 10 ? null : solution[index] as Digit
    })
    expect(planAutoFinish(state)).toHaveLength(10)
    expect(reduceGame(state, { type: 'game/auto-finish' }).cells.map((cell) => cell.value)).toEqual(solution)
  })
  it('proves a complete chain without trusting notes or mutating the board', () => {
    const state = endgame()
    state.cells[0]!.corner = [9]
    state.cells[1]!.center = [8]
    const original = structuredClone(state)
    const plan = planAutoFinish(state)
    expect(plan).toHaveLength(10)
    expect(plan?.every(({ index, digit }) => digit === SOLUTION[index])).toBe(true)
    expect(state).toEqual(original)
  })

  it('requires an unfinished, active endgame with no wrong entries', () => {
    expect(planAutoFinish(endgame(11))).toBeNull()
    expect(planAutoFinish(endgame(0))).toBeNull()
    for (const status of ['paused', 'completed'] as const) {
      expect(planAutoFinish({ ...endgame(), status })).toBeNull()
    }
    const wrong = endgame()
    wrong.cells[12]!.value = 9
    expect(planAutoFinish(wrong)).toBeNull()
    expect(reduceGame(wrong, { type: 'game/auto-finish' })).toBe(wrong)
  })

  it('does not use the stored solution to guess an ambiguous rectangle', () => {
    // A valid completed classic grid with a swappable 6/7 rectangle.
    const solution = [...'534678912672195348198342567859761423426853791713924856961537284287419635345286179'].map(Number)
    const state = endgame(0)
    state.puzzle.solution = solution
    state.cells.forEach((cell, index) => {
      cell.value = [3, 4, 30, 31].includes(index) ? null : solution[index] as Digit
    })
    expect(planAutoFinish(state)).toBeNull()
    expect(reduceGame(state, { type: 'game/auto-finish' })).toBe(state)
  })

  it('finishes atomically, freezes time, preserves colors, and undoes/redoes all changes', () => {
    const state = endgame()
    state.cells[0]!.corner = [9]
    state.cells[1]!.center = [8]
    state.cells[0]!.color = 'sage'
    const finished = reduceGame(state, { type: 'game/auto-finish', at: 3500 })
    expect(finished.status).toBe('completed')
    expect(finished.elapsedMs).toBe(2500)
    expect(finished.completedAt).toBe(3500)
    expect(finished.lastResumedAt).toBeNull()
    expect(finished.hintsUsed).toBe(1)
    expect(finished.mistakes).toBe(0)
    expect(finished.history).toHaveLength(1)
    expect(finished.cells.map((cell) => cell.value)).toEqual(SOLUTION)
    expect(finished.cells[0]!.color).toBe('sage')
    expect(finished.cells[0]!.corner).toEqual([])
    expect(reduceGame(finished, { type: 'game/auto-finish', at: 4000 })).toBe(finished)
    const undone = reduceGame(finished, { type: 'history/undo', at: 5000 })
    expect(undone.cells).toEqual(state.cells)
    expect(undone.hintsUsed).toBe(0)
    expect(undone.status).toBe('playing')
    expect(undone.lastResumedAt).toBe(5000)
    const redone = reduceGame(undone, { type: 'history/redo', at: 5100 })
    expect(redone.cells).toEqual(finished.cells)
    expect(redone.status).toBe('completed')
    expect(redone.hintsUsed).toBe(1)
  })

  it('persists and replays a named assistance action including givens', () => {
    const givens = SOLUTION.map((value, index) => index < 10 ? 0 : value)
    const puzzle = puzzleWithGivens(givens)
    const state = createGameState(puzzle, { now: 1000 })
    const result = reduceAndRecord(state, createEventLog(puzzle, 1000), { type: 'game/auto-finish' }, 3500)
    const log = JSON.parse(JSON.stringify(result.log)) as typeof result.log
    expect(replayEventLog(log)).toEqual(result.state)
    const frames = buildReviewFrames(log)
    expect(frames).toHaveLength(2)
    expect(frames[1]!.assessment).toBe('assistance')
    expect(frames[1]!.delta.valuesPlaced).toBe(10)
    expect(frames[1]!.important).toBe(true)
    expect(result.state.cells.slice(10)).toEqual(state.cells.slice(10))
  })
})
