import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/domain/catalog'
import {
  addGameRecord,
  checkpointActiveSession,
  clearActiveSession,
  createGameRecord,
  createGameState,
  emptyPlayerStats,
  gameActions,
  loadActiveSession,
  loadSettings,
  loadStats,
  reduceGame,
  resetFallbackStorageForTests,
  saveActiveSession,
  saveGameCompletion,
  saveSettings,
} from '../../src/game'
import { puzzleWithGivens, SOLUTION } from './fixture'

describe('game persistence and statistics', () => {
  beforeEach(async () => {
    resetFallbackStorageForTests()
    await clearActiveSession()
  })

  it('round-trips an active session and rebases its running clock', async () => {
    let state = createGameState(puzzleWithGivens(), { now: 100 })
    state = reduceGame(state, gameActions.tick(600))
    await saveActiveSession(state, null, 700)

    const restored = await loadActiveSession({ now: 5_000 })
    expect(restored?.state.elapsedMs).toBe(500)
    expect(restored?.state.lastResumedAt).toBe(5_000)
    expect(restored?.savedAt).toBe(700)
  })

  it('merges partial or malformed preferences into safe defaults', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', sound: true })
    expect(await loadSettings()).toMatchObject({ theme: 'dark', sound: true })
  })

  it('recovers a newer synchronous checkpoint while an older save is queued', async () => {
    const initial = createGameState(puzzleWithGivens(), { now: 0 })
    const pending = saveActiveSession(initial, null, 100)
    const edited = reduceGame(initial, gameActions.setDigit(4, 200))
    checkpointActiveSession(edited, null, 200)
    await pending
    expect((await loadActiveSession({ rebaseRunningClock: false }))?.state).toEqual(edited)

    const newer = reduceGame(edited, gameActions.setDigit(5, 300))
    await saveActiveSession(newer, null, 300)
    expect((await loadActiveSession({ rebaseRunningClock: false }))?.state).toEqual(newer)
    await clearActiveSession()
    expect(await loadActiveSession()).toBeNull()
  })

  it('updates daily streaks once per calendar day', () => {
    const base = emptyPlayerStats()
    const first = addGameRecord(
      base,
      {
        id: 'one',
        puzzleId: 'daily-one',
        variant: 'classic',
        difficulty: 'focused',
        elapsedMs: 1_000,
        mistakes: 0,
        hintsUsed: 0,
        completedAt: 1,
      },
      '2026-07-30',
    )
    const repeatedDay = addGameRecord(
      first,
      {
        id: 'two',
        puzzleId: 'daily-two',
        variant: 'classic',
        difficulty: 'focused',
        elapsedMs: 2_000,
        mistakes: 1,
        hintsUsed: 0,
        completedAt: 2,
      },
      '2026-07-30',
    )
    const nextDay = addGameRecord(
      repeatedDay,
      {
        id: 'three',
        puzzleId: 'daily-three',
        variant: 'classic',
        difficulty: 'focused',
        elapsedMs: 3_000,
        mistakes: 0,
        hintsUsed: 1,
        completedAt: 3,
      },
      '2026-07-31',
    )

    expect(nextDay.currentDailyStreak).toBe(2)
    expect(nextDay.completed).toBe(3)
    expect(nextDay.cleanSolves).toBe(1)
    expect(nextDay.totalTimeMs).toBe(6_000)
  })

  it('persists a completed game record transactionally', async () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    let state = createGameState(
      puzzleWithGivens(givens, 'daily:2026-07-31:classic:focused'),
      { now: 0 },
    )
    state = reduceGame(
      state,
      gameActions.setDigit(SOLUTION[0] as 1, 1_000),
    )

    const record = createGameRecord(state)
    expect(record.elapsedMs).toBe(1_000)

    const completed = await saveGameCompletion(state, {
      dailyDate: '2026-07-31',
    })
    expect(completed.stats.completed).toBe(1)
    expect((await loadStats()).records).toHaveLength(1)

    const duplicate = await saveGameCompletion(state, {
      dailyDate: '2026-07-31',
    })
    expect(duplicate.stats.completed).toBe(1)
  })
})
