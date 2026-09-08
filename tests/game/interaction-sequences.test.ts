import { describe, expect, it } from 'vitest'
import type { Digit, InputMode, VariantId } from '../../src/domain/types'
import { createSeededRandom } from '../../src/engine/random'
import { solve } from '../../src/engine/solver'
import { createEventLog, createGameState, gameActions, reduceAndRecord, replayEventLog } from '../../src/game'

describe('mixed gameplay sequences', () => {
  it.each<VariantId>(['classic', 'diagonal', 'anti-knight'])(
    'preserves targets, givens, previous states and replay across 600 actions in %s',
    (variant) => {
      const random = createSeededRandom(`input-regression:${variant}`)
      const solution = solve(Array<number>(81).fill(0), variant)!
      const puzzle = {
        id: `sequence:${variant}`, seed: 'sequence', variant,
        difficulty: 'focused' as const, generatedAt: 0, technique: 'test',
        solution, givens: solution.map((value, index) => index % 7 === 0 ? value : 0),
      }
      let state = createGameState(puzzle, { now: 0 })
      let log = createEventLog(puzzle, 0)
      const options = { maxHistory: 30 }
      for (let step = 1; step <= 600; step++) {
        const digit = (random.integer(9) + 1) as Digit
        const mode = random.pick<InputMode>(['value', 'corner', 'center', 'color'])
        const action = random.pick([
          gameActions.select(random.integer(81), random.pick(['replace', 'add', 'toggle'])),
          gameActions.clearSelection(),
          gameActions.setMode(mode),
          gameActions.setDigit(digit),
          gameActions.setDigit(digit, undefined, mode),
          gameActions.setColor(random.pick(['sage', 'sky', 'sand', 'rose'])),
          gameActions.erase(),
          gameActions.undo(), gameActions.redo(),
          gameActions.pause(step), gameActions.resume(step),
        ])
        const before = state
        const beforeCopy = structuredClone(before)
        const result = reduceAndRecord(state, log, action, step, options)
        state = result.state
        log = result.log
        expect(before).toEqual(beforeCopy)
        expect(state.selected.length).toBe(new Set(state.selected).size)
        expect(state.anchor === -1 || state.selected.includes(state.anchor)).toBe(true)
        for (let index = 0; index < 81; index++) {
          const cell = state.cells[index]!
          if (puzzle.givens[index]) expect(cell.value).toBe(puzzle.givens[index])
          expect(cell.corner.every((value) => !cell.center.includes(value))).toBe(true)
          if (cell.value !== null) {
            expect(cell.corner).toEqual([])
            expect(cell.center).toEqual([])
          }
          if (action.type.startsWith('input/') && !before.selected.includes(index)) {
            expect(cell.value).toBe(before.cells[index]!.value)
            expect(cell.color).toBe(before.cells[index]!.color)
          }
        }
        if (before.status === 'paused' && action.type.startsWith('input/')) {
          expect(state.cells).toEqual(before.cells)
        }
      }
      expect(replayEventLog(log, options)).toEqual(state)
    },
    30_000,
  )
})
