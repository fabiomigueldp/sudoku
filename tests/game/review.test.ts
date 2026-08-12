import { describe, expect, it } from 'vitest'
import {
  appendGameEvent,
  buildReviewFrames,
  createEventLog,
  gameActions,
} from '../../src/game'
import { puzzleWithGivens, SOLUTION } from './fixture'

describe('post-game review model', () => {
  it('recognizes a move that follows the current logical deduction', () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    const puzzle = puzzleWithGivens(givens, 'review-logical')
    const action = gameActions.setDigit(SOLUTION[0] as 1, 1_000)
    const log = appendGameEvent(
      createEventLog(puzzle, 0),
      action,
      1_000,
    ).log

    const frames = buildReviewFrames(log)
    expect(frames).toHaveLength(2)
    expect(frames[1]).toMatchObject({
      assessment: 'logical-match',
      important: false,
      delta: { cells: [0], valuesPlaced: 1 },
    })
    expect(frames[1]?.logicalStep?.technique).toBe('naked-single')
  })

  it('marks an incompatible value as an important review moment', () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    const puzzle = puzzleWithGivens(givens, 'review-mistake')
    const action = gameActions.setDigit(2, 1_000)
    const log = appendGameEvent(
      createEventLog(puzzle, 0),
      action,
      1_000,
    ).log

    const frame = buildReviewFrames(log)[1]
    expect(frame?.assessment).toBe('incorrect')
    expect(frame?.important).toBe(true)
  })
})
