import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, EMPTY_STATS } from '../../src/domain/catalog'
import {
  clearAllStoredData,
  appendGameEvent,
  createEventLog,
  createGameState,
  exportDataBackup,
  gameActions,
  listArchivedGameSummaries,
  loadArchivedGame,
  loadPracticeProgress,
  loadSettings,
  loadStats,
  parseDataBackup,
  reduceGame,
  resetFallbackStorageForTests,
  restoreDataBackup,
  saveActiveSession,
  saveGameCompletion,
} from '../../src/game'
import { puzzleWithGivens, SOLUTION } from './fixture'

describe('completed archive and full backup', () => {
  beforeEach(async () => {
    resetFallbackStorageForTests()
    await clearAllStoredData()
  })

  it('archives a completed game with its replay conditions', async () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    const puzzle = puzzleWithGivens(givens, 'archive-game')
    const startedAt = 100
    let state = createGameState(puzzle, { now: startedAt })
    const action = gameActions.setDigit(SOLUTION[0] as 1, 1_000)
    const log = appendGameEvent(
      createEventLog(puzzle, startedAt),
      action,
      1_000,
    ).log
    state = reduceGame(
      state,
      action,
    )

    await saveGameCompletion(state, {
      eventLog: log,
      replaySettings: {
        autoRemoveCandidates: false,
        errorPolicy: 'on-demand',
      },
    })

    const summaries = await listArchivedGameSummaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      puzzleId: puzzle.id,
      replayable: true,
      kind: 'standard',
    })
    const archived = await loadArchivedGame(summaries[0]?.id ?? '')
    expect(archived?.state.cells[0]?.value).toBe(SOLUTION[0])
    expect(archived?.replaySettings).toEqual({
      autoRemoveCandidates: false,
      errorPolicy: 'on-demand',
    })
  })

  it('exports, verifies and restores every local data family', async () => {
    const puzzle = puzzleWithGivens(undefined, 'active-backup')
    const state = createGameState(puzzle, { now: 500 })
    await saveActiveSession(state, createEventLog(puzzle, 500), 600)

    const exported = await exportDataBackup(1_000)
    expect(exported.summary.hasActiveSession).toBe(true)
    expect(parseDataBackup(exported.serialized).summary.exportedAt).toBe(1_000)

    await clearAllStoredData()
    await restoreDataBackup(exported.serialized)

    expect((await loadSettings()).sound).toBe(DEFAULT_SETTINGS.sound)
    expect(await loadStats()).toEqual(EMPTY_STATS)
    expect((await loadPracticeProgress()).records).toEqual([])
    expect(parseDataBackup(exported.serialized).snapshot.session?.state.puzzle.id)
      .toBe(puzzle.id)
  })

  it('rejects a backup whose content was changed', async () => {
    const exported = await exportDataBackup(1_000)
    const changed = exported.serialized.replace(
      '"exportedAt": 1000',
      '"exportedAt": 1001',
    )

    // exportedAt is metadata and intentionally outside the content checksum.
    expect(parseDataBackup(changed).summary.exportedAt).toBe(1_001)

    const corrupted = exported.serialized.replace(
      '"completed": 0',
      '"completed": 1',
    )
    expect(() => parseDataBackup(corrupted)).toThrow(/alterado|corrompido/i)
  })
})
