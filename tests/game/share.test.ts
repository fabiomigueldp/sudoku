import { describe, expect, it } from 'vitest'
import {
  GAME_SNAPSHOT_PREFIX,
  SudokuShareError,
  createGameState,
  exportGameSnapshot,
  exportPuzzleString,
  gameActions,
  importGameSnapshot,
  parseImportedPuzzle,
  reduceGame,
} from '../../src/game'

const CLASSIC_PUZZLE =
  '530070000' +
  '600195000' +
  '098000060' +
  '800060003' +
  '400803001' +
  '700020006' +
  '060000280' +
  '000419005' +
  '000080079'

const CLASSIC_SOLUTION =
  '534678912' +
  '672195348' +
  '198342567' +
  '859761423' +
  '426853791' +
  '713924856' +
  '961537284' +
  '287419635' +
  '345286179'

function errorCode(action: () => unknown): string | undefined {
  try {
    action()
    return undefined
  } catch (error) {
    return error instanceof SudokuShareError ? error.code : undefined
  }
}

describe('puzzle text sharing', () => {
  it('imports whitespace, dots and zeroes into a deterministic definition', () => {
    const formatted = CLASSIC_PUZZLE.replaceAll('0', '.')
      .match(/.{9}/g)
      ?.join('\n') as string

    const first = parseImportedPuzzle(formatted, 'classic', 'challenging')
    const second = parseImportedPuzzle(CLASSIC_PUZZLE, 'classic', 'challenging')

    expect(first).toEqual(second)
    expect(first.solution.join('')).toBe(CLASSIC_SOLUTION)
    expect(first.generatedAt).toBe(0)
    expect(first.id).toMatch(/^import-classic-challenging-[0-9a-f]{8}$/)
    expect(exportPuzzleString(first)).toBe(CLASSIC_PUZZLE.replaceAll('0', '.'))
  })

  it('rejects invalid size and characters with typed errors', () => {
    expect(errorCode(() => parseImportedPuzzle('123', 'classic'))).toBe(
      'PUZZLE_LENGTH',
    )
    expect(
      errorCode(() =>
        parseImportedPuzzle(`x${CLASSIC_PUZZLE.slice(1)}`, 'classic'),
      ),
    ).toBe('PUZZLE_CHARACTERS')
  })

  it('rejects conflicts, impossible diagrams and ambiguous diagrams', () => {
    expect(
      errorCode(() =>
        parseImportedPuzzle(`11${'0'.repeat(79)}`, 'classic'),
      ),
    ).toBe('PUZZLE_CONFLICT')

    const impossible = `1${CLASSIC_PUZZLE.slice(1)}`
    expect(errorCode(() => parseImportedPuzzle(impossible, 'classic'))).toBe(
      'PUZZLE_NO_SOLUTION',
    )

    expect(
      errorCode(() => parseImportedPuzzle('0'.repeat(81), 'classic')),
    ).toBe('PUZZLE_MULTIPLE_SOLUTIONS')
  })

  it('applies the selected variant while validating conflicts', () => {
    const classic = parseImportedPuzzle(CLASSIC_PUZZLE, 'classic')
    expect(classic.variant).toBe('classic')

    // The classic solution repeats 5 on its main diagonal, so it cannot be
    // imported as a completed diagonal Sudoku.
    expect(
      errorCode(() => parseImportedPuzzle(CLASSIC_SOLUTION, 'diagonal')),
    ).toBe('PUZZLE_CONFLICT')
  })
})

describe('game snapshot sharing', () => {
  it('round-trips a complete game state, including history and candidates', () => {
    const puzzle = parseImportedPuzzle(CLASSIC_PUZZLE, 'classic', 'focused')
    let state = createGameState(puzzle, { now: 100 })

    state = reduceGame(state, gameActions.setMode('corner', 150))
    state = reduceGame(state, gameActions.setDigit(1, 200))
    state = reduceGame(state, gameActions.setDigit(2, 250))
    state = reduceGame(state, gameActions.setMode('value', 300))
    state = reduceGame(state, gameActions.setDigit(4, 350))
    state = reduceGame(state, gameActions.pause(500))

    const shared = exportGameSnapshot(state)
    const restored = importGameSnapshot(shared)

    expect(shared.startsWith(GAME_SNAPSHOT_PREFIX)).toBe(true)
    expect(restored).toEqual(state)
    expect(restored).not.toBe(state)
    expect(restored.cells).not.toBe(state.cells)
    expect(restored.history).not.toBe(state.history)
  })

  it('round-trips Unicode hint text without depending on browser storage', () => {
    const puzzle = parseImportedPuzzle(CLASSIC_PUZZLE, 'classic')
    let state = createGameState(puzzle, { now: 0 })
    state = reduceGame(
      state,
      gameActions.showHint(
        {
          technique: 'single',
          title: 'Único candidato',
          explanation: 'A célula aceita apenas o dígito 4 — observe a região.',
          cells: [2],
          digit: 4,
        },
        10,
      ),
    )

    expect(importGameSnapshot(exportGameSnapshot(state))).toEqual(state)
  })

  it('rejects unknown versions, malformed text and corrupted payloads', () => {
    const state = createGameState(
      parseImportedPuzzle(CLASSIC_PUZZLE, 'classic'),
      { now: 0 },
    )
    const shared = exportGameSnapshot(state)

    expect(errorCode(() => importGameSnapshot('not-a-snapshot'))).toBe(
      'SNAPSHOT_FORMAT',
    )
    expect(
      errorCode(() =>
        importGameSnapshot(shared.replace(/^ASUD1\./, 'ASUD2.')),
      ),
    ).toBe('SNAPSHOT_VERSION')
    expect(
      errorCode(() => importGameSnapshot(`${shared.slice(0, -1)}!`)),
    ).toBe('SNAPSHOT_FORMAT')

    const changedLastCharacter =
      shared.slice(-1) === 'A'
        ? `${shared.slice(0, -1)}B`
        : `${shared.slice(0, -1)}A`
    expect(() => importGameSnapshot(changedLastCharacter)).toThrow(
      SudokuShareError,
    )
  })

  it('refuses to export internally inconsistent state', () => {
    const state = createGameState(
      parseImportedPuzzle(CLASSIC_PUZZLE, 'classic'),
      { now: 0 },
    )
    const corrupted = {
      ...state,
      cells: state.cells.map((cell, index) =>
        index === 0 ? { ...cell, value: 1 as const } : cell,
      ),
    }

    expect(errorCode(() => exportGameSnapshot(corrupted))).toBe('GAME_STATE')
  })
})
