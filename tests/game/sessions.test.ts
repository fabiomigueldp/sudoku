import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendGameEvent,
  checkpointActiveSession,
  clearAllStoredData,
  createEventLog,
  createGameState,
  deleteSavedSession,
  exportDataBackup,
  gameActions,
  listArchivedGameSummaries,
  listSavedGameSummaries,
  listSavedSessions,
  loadActiveSession,
  loadSavedSession,
  parseDataBackup,
  reduceGame,
  resetFallbackStorageForTests,
  restoreDataBackup,
  saveActiveSession,
  saveGameCompletion,
} from '../../src/game'
import { puzzleWithGivens, SOLUTION } from './fixture'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
    clear: () => values.clear(),
  }
}

function resignBackup(document: { checksum: string; data: unknown }): string {
  let hash = 0x811c9dc5
  const data = JSON.stringify(document.data)
  for (let index = 0; index < data.length; index += 1) {
    hash = Math.imul(hash ^ data.charCodeAt(index), 0x01000193)
  }
  document.checksum = (hash >>> 0).toString(16).padStart(8, '0')
  return JSON.stringify(document)
}

describe('independent saved attempts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    resetFallbackStorageForTests()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps attempts of the same puzzle separate, including notes, colors and undo/redo', async () => {
    const puzzle = puzzleWithGivens()
    let first = createGameState(puzzle, { now: 100 })
    let log = createEventLog(puzzle, 100)
    const actions = [
      gameActions.setDigit(3, 200, 'corner'),
      gameActions.setColor('sky', 300),
      gameActions.setDigit(4, 400),
      gameActions.undo(500),
      gameActions.pause(600),
    ]
    for (const action of actions) {
      first = reduceGame(first, action)
      log = appendGameEvent(log, action, action.at!).log
    }
    const second = createGameState(puzzle, { now: 1_000, startPaused: true })
    await saveActiveSession(first, log, 700, 'first-attempt')
    await saveActiveSession(second, null, 1_100, 'second-attempt')

    expect((await listSavedGameSummaries()).map((entry) => entry.id)).toEqual(['second-attempt', 'first-attempt'])
    expect((await loadSavedSession('first-attempt'))?.state).toEqual(first)
    expect((await loadSavedSession('first-attempt'))?.eventLog).toEqual(log)
    expect((await loadSavedSession('second-attempt'))?.state).toEqual(second)
    expect((await loadActiveSession())?.id).toBe('second-attempt')
  })

  it('recovers a checkpoint by attempt identity without replacing another saved game', async () => {
    const first = createGameState(puzzleWithGivens(), { now: 0 })
    const edited = reduceGame(first, gameActions.setDigit(6, 200))
    await saveActiveSession(first, null, 100, 'first')
    checkpointActiveSession(edited, null, 200, 'first')
    await saveActiveSession(first, null, 300, 'second')
    expect((await loadActiveSession())?.id).toBe('second')
    expect((await loadSavedSession('first'))?.state.cells[0]?.value).toBe(6)
    expect(await listSavedGameSummaries()).toHaveLength(2)
    await deleteSavedSession('first')
    expect(await loadSavedSession('first')).toBeNull()
    expect((await listSavedGameSummaries()).map((entry) => entry.id)).toEqual(['second'])
    expect((await loadActiveSession())?.id).toBe('second')
  })

  it('migrates an existing single-slot save once and never resurrects it after deletion', async () => {
    const state = createGameState(puzzleWithGivens(), { now: 100 })
    localStorage.setItem('absolute-sudoku:session:v2', JSON.stringify({ schemaVersion: 3, savedAt: 200, state, eventLog: null }))
    const migrated = await loadActiveSession()
    expect(migrated?.schemaVersion).toBe(4)
    expect(migrated?.id).toBeTruthy()
    await saveActiveSession(state, null, 300, 'new-attempt')
    expect(await listSavedGameSummaries()).toHaveLength(2)
    expect(await listSavedGameSummaries()).toHaveLength(2)
    await deleteSavedSession(migrated!.id)
    expect(await loadSavedSession(migrated!.id)).toBeNull()
    expect(await listSavedGameSummaries()).toHaveLength(1)
  })

  it('archives only the completed attempt, leaving other attempts of that puzzle untouched', async () => {
    const givens = [...SOLUTION]
    givens[0] = 0
    const state = createGameState(puzzleWithGivens(givens), { now: 100 })
    await saveActiveSession(state, null, 200, 'first')
    await saveActiveSession(state, null, 300, 'second')
    const completed = reduceGame(state, gameActions.setDigit(SOLUTION[0] as 1, 500))
    checkpointActiveSession(state, null, 400, 'first')
    await saveGameCompletion(completed, { sessionId: 'first' })
    expect((await listSavedGameSummaries()).map((entry) => entry.id)).toEqual(['second'])
    expect(await listArchivedGameSummaries()).toHaveLength(1)
    expect((await loadSavedSession('second'))?.state.status).toBe('playing')
  })

  it('round-trips all attempts and restores without merging unrelated local games', async () => {
    const state = createGameState(puzzleWithGivens(), { now: 100, startPaused: true })
    await saveActiveSession(state, null, 200, 'first')
    await saveActiveSession(state, null, 300, 'second')
    const backup = await exportDataBackup(1_000)
    expect(backup.summary.savedGames).toBe(2)
    await saveActiveSession(state, null, 400, 'third')
    checkpointActiveSession(state, null, 500, 'third')
    await restoreDataBackup(backup.serialized)
    expect((await listSavedSessions()).map((entry) => entry.id)).toEqual(['second', 'first'])
    expect((await loadActiveSession())?.id).toBe('second')
    await clearAllStoredData()
    expect(await listSavedGameSummaries()).toEqual([])
    expect(await loadActiveSession()).toBeNull()
  })

  it('accepts v1 backups and rejects duplicate or corrupt attempts before restoring', async () => {
    await saveActiveSession(createGameState(puzzleWithGivens(), { now: 100 }), null, 200, 'first')
    const exported = await exportDataBackup()
    const old = JSON.parse(exported.serialized)
    old.version = 1
    delete old.data.sessions
    delete old.data.session.id
    old.data.session.schemaVersion = 3
    expect(parseDataBackup(resignBackup(old)).summary.savedGames).toBe(1)
    await restoreDataBackup(resignBackup(old))
    expect(await listSavedGameSummaries()).toHaveLength(1)

    const duplicate = JSON.parse(exported.serialized)
    duplicate.data.sessions.push(duplicate.data.sessions[0])
    expect(() => parseDataBackup(resignBackup(duplicate))).toThrow(/repetidos/)
    const corrupt = JSON.parse(exported.serialized)
    corrupt.data.sessions[0].state.cells = []
    await expect(restoreDataBackup(resignBackup(corrupt))).rejects.toThrow(/corrompida/)
    expect(await listSavedGameSummaries()).toHaveLength(1)
  })

  it('does not hide valid games when one fallback is damaged', async () => {
    const state = createGameState(puzzleWithGivens(), { now: 100 })
    await saveActiveSession(state, null, 200, 'first')
    localStorage.setItem('absolute-sudoku:saved:v1:damaged', '{invalid')
    expect((await listSavedGameSummaries()).map((entry) => entry.id)).toEqual(['first'])
  })

  it('reports non-durable saves and keeps the newest in-memory progress if storage is full', async () => {
    const state = createGameState(puzzleWithGivens(), { now: 100 })
    await saveActiveSession(state, null, 200, 'first')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    const edited = reduceGame(state, gameActions.setDigit(7, 300))
    expect(await saveActiveSession(edited, null, 400, 'first')).toEqual({ backend: 'fallback', durable: false })
    expect((await loadSavedSession('first'))?.state.cells[0]?.value).toBe(7)
    expect((await loadActiveSession())?.state.cells[0]?.value).toBe(7)
  })

  it('rebases returned running clocks without mutating the recovery copy', async () => {
    vi.stubGlobal('localStorage', undefined)
    const state = createGameState(puzzleWithGivens(), { now: 100 })
    await saveActiveSession(state, null, 200, 'first')
    const resumed = await loadSavedSession('first', { now: 5_000 })
    expect(resumed?.state.lastResumedAt).toBe(5_000)
    resumed!.state.cells[0]!.value = 9
    const original = await loadSavedSession('first', { rebaseRunningClock: false })
    expect(original?.state.lastResumedAt).toBe(100)
    expect(original?.state.cells[0]?.value).toBeNull()
  })
})
