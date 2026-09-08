import { describe, expect, it } from 'vitest'
import {
  createEventLog,
  createGameState,
  gameActions,
  reduceAndRecord,
  reduceGame,
  replayEventLog,
} from '../../src/game'
import { puzzleWithGivens, SOLUTION } from './fixture'

describe('game reducer', () => {
  it('applies keypad input consistently in value, corner, center and color modes', () => {
    let state = createGameState(puzzleWithGivens(), { now: 0 })

    state = reduceGame(state, gameActions.setMode('corner'))
    state = reduceGame(state, gameActions.setDigit(3))
    state = reduceGame(state, gameActions.setMode('center'))
    state = reduceGame(state, gameActions.setDigit(7))
    state = reduceGame(state, gameActions.setMode('color'))
    state = reduceGame(state, gameActions.setDigit(2))

    expect(state.cells[0]).toMatchObject({
      value: null,
      corner: [3],
      center: [7],
      color: 'sky',
    })

    state = reduceGame(state, gameActions.erase())
    expect(state.cells[0]?.color).toBeNull()
    expect(state.cells[0]?.corner).toEqual([3])
    expect(state.cells[0]?.center).toEqual([7])

    state = reduceGame(state, gameActions.setMode('value'))
    state = reduceGame(state, gameActions.setDigit(1))
    expect(state.cells[0]).toMatchObject({
      value: 1,
      corner: [],
      center: [],
    })
  })

  it('keeps value, candidate and color layers independent', () => {
    let state = createGameState(puzzleWithGivens(), { now: 0 })

    state = reduceGame(state, gameActions.setMode('corner'))
    state = reduceGame(state, gameActions.setDigit(4))
    state = reduceGame(state, gameActions.setMode('center'))
    state = reduceGame(state, gameActions.setDigit(4))
    expect(state.cells[0]).toMatchObject({
      value: null,
      corner: [],
      center: [4],
      color: null,
    })

    state = reduceGame(state, gameActions.setColor('sage'))
    state = reduceGame(state, gameActions.setMode('value'))
    state = reduceGame(state, gameActions.setDigit(1))
    expect(state.cells[0]).toMatchObject({
      value: 1,
      corner: [],
      center: [],
      color: 'sage',
    })

    state = reduceGame(state, gameActions.erase())
    expect(state.cells[0]).toMatchObject({ value: null, color: 'sage' })

    state = reduceGame(state, gameActions.setMode('color'))
    state = reduceGame(state, gameActions.erase())
    expect(state.cells[0]?.color).toBeNull()
  })

  it('colors givens and toggles a multi-cell color change atomically', () => {
    const givens = Array<number>(81).fill(0)
    givens[0] = SOLUTION[0] ?? 1
    let state = createGameState(puzzleWithGivens(givens), { now: 0 })

    state = reduceGame(state, gameActions.select(0))
    state = reduceGame(state, gameActions.setColor('rose'))
    expect(state.cells[0]).toMatchObject({
      given: true,
      value: SOLUTION[0],
      color: 'rose',
    })

    state = reduceGame(state, gameActions.select(1))
    state = reduceGame(state, gameActions.select(2, 'add'))
    state = reduceGame(state, gameActions.setColor('sky'))
    expect(state.cells[1]?.color).toBe('sky')
    expect(state.cells[2]?.color).toBe('sky')

    state = reduceGame(state, gameActions.setColor('sky'))
    expect(state.cells[1]?.color).toBeNull()
    expect(state.cells[2]?.color).toBeNull()

    state = reduceGame(state, gameActions.undo())
    expect(state.cells[1]?.color).toBe('sky')
    expect(state.cells[2]?.color).toBe('sky')
  })

  it('undoes a placement and every automatic candidate removal atomically', () => {
    let state = createGameState(puzzleWithGivens(), { now: 0 })

    state = reduceGame(state, gameActions.select(1, 'replace', 10))
    state = reduceGame(state, gameActions.setMode('corner', 20))
    state = reduceGame(state, gameActions.setDigit(5, 30))
    state = reduceGame(state, gameActions.select(40, 'replace', 40))
    state = reduceGame(state, gameActions.setDigit(5, 50))

    expect(state.cells[1]?.corner).toEqual([5])
    expect(state.cells[40]?.corner).toEqual([5])

    state = reduceGame(state, gameActions.setMode('value', 60))
    state = reduceGame(state, gameActions.select(0, 'replace', 70))
    state = reduceGame(state, gameActions.setDigit(5, 80))

    expect(state.cells[0]?.value).toBe(5)
    expect(state.cells[1]?.corner).toEqual([])
    expect(state.cells[40]?.corner).toEqual([5])

    state = reduceGame(state, gameActions.undo(90))
    expect(state.cells[0]?.value).toBeNull()
    expect(state.cells[1]?.corner).toEqual([5])
    expect(state.cells[40]?.corner).toEqual([5])

    state = reduceGame(state, gameActions.redo(100))
    expect(state.cells[0]?.value).toBe(5)
    expect(state.cells[1]?.corner).toEqual([])
    expect(state.cells[40]?.corner).toEqual([5])
  })

  it('replays the same timestamped event log deterministically', () => {
    const puzzle = puzzleWithGivens()
    let state = createGameState(puzzle, { now: 1_000 })
    let log = createEventLog(puzzle, 1_000)

    for (const [action, at] of [
      [gameActions.setMode('corner'), 1_100],
      [gameActions.setDigit(1), 1_200],
      [gameActions.select(10), 1_300],
      [gameActions.setDigit(2), 1_400],
      [gameActions.undo(), 1_500],
      [gameActions.redo(), 1_600],
    ] as const) {
      const reduced = reduceAndRecord(state, log, action, at)
      state = reduced.state
      log = reduced.log
    }

    expect(replayEventLog(log)).toEqual(state)
  })

  it('uses monotonic timestamps across pause and resume', () => {
    let state = createGameState(puzzleWithGivens(), { now: 1_000 })

    state = reduceGame(state, gameActions.tick(1_500))
    state = reduceGame(state, gameActions.pause(2_000))
    state = reduceGame(state, gameActions.tick(4_000))
    expect(state.elapsedMs).toBe(1_000)
    expect(state.status).toBe('paused')

    state = reduceGame(state, gameActions.resume(5_000))
    state = reduceGame(state, gameActions.tick(5_250))
    expect(state.elapsedMs).toBe(1_250)
    expect(state.lastResumedAt).toBe(5_250)
  })

  it('reveals hints in four phases and only applies the last phase', () => {
    let state = createGameState(puzzleWithGivens(), { now: 0 })
    state = reduceGame(
      state,
      gameActions.showHint({
        technique: 'naked-single',
        title: 'Único candidato',
        explanation: 'A célula aceita apenas um dígito.',
        cells: [0],
        digit: 1,
      }),
    )

    expect(state.hint?.phase).toBe(1)
    expect(state.hintsUsed).toBe(1)
    state = reduceGame(state, gameActions.applyHint())
    expect(state.cells[0]?.value).toBeNull()

    state = reduceGame(state, gameActions.advanceHint())
    state = reduceGame(state, gameActions.advanceHint())
    state = reduceGame(state, gameActions.advanceHint())
    expect(state.hint?.phase).toBe(4)

    state = reduceGame(state, gameActions.applyHint(500))
    expect(state.cells[0]?.value).toBe(1)
    expect(state.hint).toBeNull()
  })

  it('finishes automatically when the solution is complete', () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    let state = createGameState(puzzleWithGivens(givens), { now: 100 })

    state = reduceGame(
      state,
      gameActions.setDigit(SOLUTION[0] as 1, 1_100),
    )

    expect(state.status).toBe('completed')
    expect(state.completedAt).toBe(1_100)
    expect(state.elapsedMs).toBe(1_000)
    expect(state.lastResumedAt).toBeNull()
  })

  it('restores completion when redoing the final move', () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    let state = createGameState(puzzleWithGivens(givens), { now: 0 })
    state = reduceGame(state, gameActions.setDigit(1, 100))
    state = reduceGame(state, gameActions.undo(200))
    expect(state.status).toBe('playing')
    state = reduceGame(state, gameActions.redo(300))
    expect(state.status).toBe('completed')
    expect(state.completedAt).toBe(300)
    expect(state.lastResumedAt).toBeNull()
  })

  it('does not apply a hint while paused or toggle an already-correct value', () => {
    let state = createGameState(puzzleWithGivens(), { now: 0 })
    state = reduceGame(state, gameActions.showHint({
      technique: 'naked-single', title: 'Single', explanation: 'Place 1',
      cells: [0], digit: 1,
    }))
    state = reduceGame(state, gameActions.setHintPhase(4))
    const paused = reduceGame(state, gameActions.pause(10))
    expect(reduceGame(paused, gameActions.applyHint(20)).cells).toEqual(paused.cells)
    const filled = {
      ...state,
      cells: state.cells.map((cell, index) => index === 0 ? { ...cell, value: 1 as const } : cell),
    }
    expect(reduceGame(filled, gameActions.applyHint(30)).cells[0]?.value).toBe(1)
  })
})
