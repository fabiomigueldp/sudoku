import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  DifficultyId,
  Digit,
  GameRecord,
  GameSettings,
  GameState,
  PlayerStats,
  VariantId,
} from '../domain/types'
import { DEFAULT_SETTINGS, EMPTY_STATS } from '../domain/catalog'
import {
  EVENT_LOG_VERSION,
  type GameEventLog,
} from './events'
import { assertPuzzleDefinition, BOARD_SIZE } from './state'
import {
  addGameRecord,
  createGameRecord,
  dailyDateFromPuzzle,
  type CompletionResult,
} from './stats'

export const STORAGE_SCHEMA_VERSION = 2
const DATABASE_VERSION = 2
const DATABASE_NAME = 'absolute-sudoku'

const ACTIVE_SESSION_KEY = 'active' as const
const SETTINGS_KEY = 'game' as const
const STATS_KEY = 'player' as const
const METADATA_KEY = 'schema' as const

const FALLBACK_KEYS = {
  session: 'absolute-sudoku:session:v2',
  settings: 'absolute-sudoku:settings:v2',
  stats: 'absolute-sudoku:stats:v2',
} as const

export interface PersistedGameSession {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION
  savedAt: number
  state: GameState
  eventLog: GameEventLog | null
}

interface StorageMetadata {
  version: typeof STORAGE_SCHEMA_VERSION
  migratedAt: number
}

interface AbsoluteSudokuDatabase extends DBSchema {
  sessions: {
    key: typeof ACTIVE_SESSION_KEY
    value: PersistedGameSession
  }
  settings: {
    key: typeof SETTINGS_KEY
    value: GameSettings
  }
  stats: {
    key: typeof STATS_KEY
    value: PlayerStats
  }
  metadata: {
    key: typeof METADATA_KEY
    value: StorageMetadata
  }
}

export type StorageBackend = 'indexeddb' | 'fallback'

export interface StorageWriteResult {
  backend: StorageBackend
}

export interface LoadSessionOptions {
  now?: number
  /**
   * Running sessions resume from `now` without charging time spent with the app
   * closed. Set false for diagnostics or an exact serialized snapshot.
   */
  rebaseRunningClock?: boolean
}

export interface SaveCompletionOptions {
  completedAt?: number
  dailyDate?: string | null
  recordId?: string
}

interface FallbackMemory {
  session: PersistedGameSession | null
  settings: GameSettings | null
  stats: PlayerStats | null
}

const fallbackMemory: FallbackMemory = {
  session: null,
  settings: null,
  stats: null,
}

let databasePromise: Promise<IDBPDatabase<AbsoluteSudokuDatabase> | null> | null =
  null

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function writeFallback(
  key: keyof FallbackMemory,
  storageKey: string,
  value: FallbackMemory[typeof key],
): void {
  ;(fallbackMemory as Record<keyof FallbackMemory, unknown>)[key] =
    value === null ? null : cloneJson(value)

  const storage = localStorageOrNull()
  if (storage === null) return
  try {
    if (value === null) storage.removeItem(storageKey)
    else storage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Memory remains a safe fallback for quota, privacy and security failures.
  }
}

function readFallback(
  key: keyof FallbackMemory,
  storageKey: string,
): unknown {
  const storage = localStorageOrNull()
  if (storage !== null) {
    try {
      const serialized = storage.getItem(storageKey)
      if (serialized !== null) return JSON.parse(serialized) as unknown
    } catch {
      // Fall through to the in-memory mirror.
    }
  }
  const value = fallbackMemory[key]
  return value === null ? null : cloneJson(value)
}

function hasStore(
  database: IDBPDatabase<AbsoluteSudokuDatabase>,
  name: 'sessions' | 'settings' | 'stats' | 'metadata',
): boolean {
  return database.objectStoreNames.contains(name)
}

async function database(): Promise<IDBPDatabase<AbsoluteSudokuDatabase> | null> {
  if (databasePromise !== null) return databasePromise

  if (typeof indexedDB === 'undefined') {
    databasePromise = Promise.resolve(null)
    return databasePromise
  }

  databasePromise = openDB<AbsoluteSudokuDatabase>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!hasStore(db, 'sessions')) db.createObjectStore('sessions')
        if (!hasStore(db, 'settings')) db.createObjectStore('settings')
        if (!hasStore(db, 'stats')) db.createObjectStore('stats')
        if (!hasStore(db, 'metadata')) db.createObjectStore('metadata')

        // v1 used the same core stores. v2 adds explicit schema metadata and
        // versioned session envelopes; values are migrated lazily on read.
        if (oldVersion < DATABASE_VERSION) {
          void transaction.objectStore('metadata').put(
            {
              version: STORAGE_SCHEMA_VERSION,
              migratedAt: Date.now(),
            },
            METADATA_KEY,
          )
        }
      },
      terminated() {
        databasePromise = null
      },
    },
  ).catch(() => null)

  return databasePromise
}

function validDigitArray(value: unknown): value is Digit[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Number.isInteger(entry) &&
        typeof entry === 'number' &&
        entry >= 1 &&
        entry <= 9,
    )
  )
}

function validCell(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.value === null ||
      (typeof value.value === 'number' &&
        Number.isInteger(value.value) &&
        value.value >= 1 &&
        value.value <= 9)) &&
    typeof value.given === 'boolean' &&
    validDigitArray(value.corner) &&
    validDigitArray(value.center) &&
    (value.color === null ||
      value.color === 'sage' ||
      value.color === 'sky' ||
      value.color === 'sand' ||
      value.color === 'rose')
  )
}

function validSnapshot(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.cells) &&
    value.cells.length === BOARD_SIZE &&
    value.cells.every(validCell) &&
    typeof value.elapsedMs === 'number' &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    typeof value.mistakes === 'number' &&
    Number.isFinite(value.mistakes) &&
    value.mistakes >= 0 &&
    typeof value.hintsUsed === 'number' &&
    Number.isFinite(value.hintsUsed) &&
    value.hintsUsed >= 0
  )
}

function validHint(value: unknown): boolean {
  if (value === null) return true
  return (
    isObject(value) &&
    typeof value.technique === 'string' &&
    typeof value.title === 'string' &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.cells) &&
    value.cells.every(
      (index) =>
        typeof index === 'number' &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < BOARD_SIZE,
    ) &&
    (value.digit === undefined ||
      (typeof value.digit === 'number' &&
        Number.isInteger(value.digit) &&
        value.digit >= 1 &&
        value.digit <= 9)) &&
    (value.phase === 1 ||
      value.phase === 2 ||
      value.phase === 3 ||
      value.phase === 4)
  )
}

function validState(value: unknown): value is GameState {
  if (!isObject(value) || !isObject(value.puzzle)) return false
  try {
    assertPuzzleDefinition(value.puzzle as unknown as GameState['puzzle'])
  } catch {
    return false
  }

  if (!Array.isArray(value.cells) || value.cells.length !== BOARD_SIZE) {
    return false
  }
  if (!value.cells.every(validCell)) {
    return false
  }

  return (
    Array.isArray(value.selected) &&
    value.selected.every(
      (index) =>
        typeof index === 'number' &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < BOARD_SIZE,
    ) &&
    typeof value.anchor === 'number' &&
    (value.anchor === -1 ||
      (Number.isInteger(value.anchor) &&
        value.anchor >= 0 &&
        value.anchor < BOARD_SIZE)) &&
    (value.activeDigit === null ||
      (typeof value.activeDigit === 'number' &&
        Number.isInteger(value.activeDigit) &&
        value.activeDigit >= 1 &&
        value.activeDigit <= 9)) &&
    (value.inputMode === 'value' ||
      value.inputMode === 'corner' ||
      value.inputMode === 'center' ||
      value.inputMode === 'color') &&
    Array.isArray(value.history) &&
    value.history.every(validSnapshot) &&
    Array.isArray(value.future) &&
    value.future.every(validSnapshot) &&
    typeof value.elapsedMs === 'number' &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    (value.lastResumedAt === null ||
      (typeof value.lastResumedAt === 'number' &&
        Number.isFinite(value.lastResumedAt))) &&
    typeof value.mistakes === 'number' &&
    Number.isFinite(value.mistakes) &&
    value.mistakes >= 0 &&
    typeof value.hintsUsed === 'number' &&
    Number.isFinite(value.hintsUsed) &&
    value.hintsUsed >= 0 &&
    validHint(value.hint) &&
    (value.status === 'playing' ||
      value.status === 'paused' ||
      value.status === 'completed') &&
    (value.completedAt === null ||
      (typeof value.completedAt === 'number' &&
        Number.isFinite(value.completedAt)))
  )
}

function validEventLog(value: unknown): value is GameEventLog {
  if (!isObject(value)) return false
  if (!isObject(value.puzzle)) return false
  try {
    assertPuzzleDefinition(value.puzzle as unknown as GameState['puzzle'])
  } catch {
    return false
  }
  return (
    value.version === EVENT_LOG_VERSION &&
    typeof value.startedAt === 'number' &&
    Number.isFinite(value.startedAt) &&
    isObject(value.initial) &&
    typeof value.initial.startPaused === 'boolean' &&
    typeof value.initial.selectFirstEmpty === 'boolean' &&
    Array.isArray(value.events) &&
    value.events.every(
      (event, index) =>
        isObject(event) &&
        event.sequence === index + 1 &&
        typeof event.at === 'number' &&
        Number.isFinite(event.at) &&
        isObject(event.action),
    )
  )
}

/**
 * Accepts both the current envelope and the original direct-state/v1 shapes.
 * Invalid or partial sessions are ignored instead of blocking app startup.
 */
export function migrateSession(value: unknown): PersistedGameSession | null {
  if (!isObject(value)) return null
  const stateCandidate = 'state' in value ? value.state : value
  if (!validState(stateCandidate)) return null

  const eventLogCandidate = 'eventLog' in value ? value.eventLog : null
  const savedAtCandidate = 'savedAt' in value ? value.savedAt : 0
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt:
      typeof savedAtCandidate === 'number' && Number.isFinite(savedAtCandidate)
        ? savedAtCandidate
        : 0,
    state: cloneJson(stateCandidate),
    eventLog: validEventLog(eventLogCandidate)
      ? cloneJson(eventLogCandidate)
      : null,
  }
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function sanitizeSettings(value: unknown): GameSettings {
  const source = isObject(value) ? value : {}
  return {
    theme:
      source.theme === 'light' ||
      source.theme === 'dark' ||
      source.theme === 'system'
        ? source.theme
        : DEFAULT_SETTINGS.theme,
    errorPolicy:
      source.errorPolicy === 'conflicts' ||
      source.errorPolicy === 'solution' ||
      source.errorPolicy === 'on-demand' ||
      source.errorPolicy === 'completion'
        ? source.errorPolicy
        : DEFAULT_SETTINGS.errorPolicy,
    highlightPeers: bool(
      source.highlightPeers,
      DEFAULT_SETTINGS.highlightPeers,
    ),
    highlightMatches: bool(
      source.highlightMatches,
      DEFAULT_SETTINGS.highlightMatches,
    ),
    highlightCandidates: bool(
      source.highlightCandidates,
      DEFAULT_SETTINGS.highlightCandidates,
    ),
    autoRemoveCandidates: bool(
      source.autoRemoveCandidates,
      DEFAULT_SETTINGS.autoRemoveCandidates,
    ),
    autoCandidates: bool(
      source.autoCandidates,
      DEFAULT_SETTINGS.autoCandidates,
    ),
    showRemaining: bool(source.showRemaining, DEFAULT_SETTINGS.showRemaining),
    showTimer: bool(source.showTimer, DEFAULT_SETTINGS.showTimer),
    reduceMotion: bool(source.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
    highContrast: bool(source.highContrast, DEFAULT_SETTINGS.highContrast),
    sound: bool(source.sound, DEFAULT_SETTINGS.sound),
    haptics: bool(source.haptics, DEFAULT_SETTINGS.haptics),
  }
}

const VARIANTS = new Set<VariantId>(['classic', 'diagonal', 'anti-knight'])
const DIFFICULTIES = new Set<DifficultyId>([
  'relaxed',
  'focused',
  'challenging',
  'expert',
  'master',
])

function validRecord(value: unknown): value is GameRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.puzzleId === 'string' &&
    VARIANTS.has(value.variant as VariantId) &&
    DIFFICULTIES.has(value.difficulty as DifficultyId) &&
    typeof value.elapsedMs === 'number' &&
    typeof value.mistakes === 'number' &&
    typeof value.hintsUsed === 'number' &&
    typeof value.completedAt === 'number'
  )
}

function nonnegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback
}

export function sanitizeStats(value: unknown): PlayerStats {
  const source = isObject(value) ? value : {}
  const records = Array.isArray(source.records)
    ? source.records.filter(validRecord).map((record) => ({ ...record }))
    : []

  return {
    completed: nonnegative(source.completed, records.length),
    cleanSolves: nonnegative(source.cleanSolves, 0),
    totalTimeMs: nonnegative(source.totalTimeMs, 0),
    currentDailyStreak: nonnegative(source.currentDailyStreak, 0),
    lastDailyDate:
      typeof source.lastDailyDate === 'string'
        ? source.lastDailyDate
        : EMPTY_STATS.lastDailyDate,
    records,
  }
}

async function readDatabaseStore(
  store: 'sessions' | 'settings' | 'stats',
  key: 'active' | 'game' | 'player',
): Promise<unknown> {
  try {
    const db = await database()
    if (db === null) return null
    if (store === 'sessions' && key === 'active') {
      return (await db.get('sessions', key)) ?? null
    }
    if (store === 'settings' && key === 'game') {
      return (await db.get('settings', key)) ?? null
    }
    if (store === 'stats' && key === 'player') {
      return (await db.get('stats', key)) ?? null
    }
    return null
  } catch {
    return null
  }
}

export async function saveActiveSession(
  state: GameState,
  eventLog: GameEventLog | null = null,
  savedAt = Date.now(),
): Promise<StorageWriteResult> {
  const session: PersistedGameSession = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt,
    state: cloneJson(state),
    eventLog: eventLog === null ? null : cloneJson(eventLog),
  }
  writeFallback('session', FALLBACK_KEYS.session, session)

  try {
    const db = await database()
    if (db === null) return { backend: 'fallback' }
    await db.put('sessions', session, ACTIVE_SESSION_KEY)
    return { backend: 'indexeddb' }
  } catch {
    return { backend: 'fallback' }
  }
}

export async function loadActiveSession(
  options: LoadSessionOptions = {},
): Promise<PersistedGameSession | null> {
  const stored =
    (await readDatabaseStore('sessions', ACTIVE_SESSION_KEY)) ??
    readFallback('session', FALLBACK_KEYS.session)
  const session = migrateSession(stored)
  if (session === null) return null

  if (
    (options.rebaseRunningClock ?? true) &&
    session.state.status === 'playing'
  ) {
    session.state.lastResumedAt = options.now ?? Date.now()
  }
  return session
}

export async function clearActiveSession(): Promise<StorageWriteResult> {
  writeFallback('session', FALLBACK_KEYS.session, null)
  try {
    const db = await database()
    if (db === null) return { backend: 'fallback' }
    await db.delete('sessions', ACTIVE_SESSION_KEY)
    return { backend: 'indexeddb' }
  } catch {
    return { backend: 'fallback' }
  }
}

export async function saveSettings(
  settings: GameSettings,
): Promise<StorageWriteResult> {
  const safe = sanitizeSettings(settings)
  writeFallback('settings', FALLBACK_KEYS.settings, safe)
  try {
    const db = await database()
    if (db === null) return { backend: 'fallback' }
    await db.put('settings', safe, SETTINGS_KEY)
    return { backend: 'indexeddb' }
  } catch {
    return { backend: 'fallback' }
  }
}

export async function loadSettings(): Promise<GameSettings> {
  const stored =
    (await readDatabaseStore('settings', SETTINGS_KEY)) ??
    readFallback('settings', FALLBACK_KEYS.settings)
  return sanitizeSettings(stored)
}

export async function saveStats(
  stats: PlayerStats,
): Promise<StorageWriteResult> {
  const safe = sanitizeStats(stats)
  writeFallback('stats', FALLBACK_KEYS.stats, safe)
  try {
    const db = await database()
    if (db === null) return { backend: 'fallback' }
    await db.put('stats', safe, STATS_KEY)
    return { backend: 'indexeddb' }
  } catch {
    return { backend: 'fallback' }
  }
}

export async function loadStats(): Promise<PlayerStats> {
  const stored =
    (await readDatabaseStore('stats', STATS_KEY)) ??
    readFallback('stats', FALLBACK_KEYS.stats)
  return sanitizeStats(stored)
}

export async function saveGameCompletion(
  state: GameState,
  options: SaveCompletionOptions = {},
): Promise<CompletionResult> {
  const record = createGameRecord(
    state,
    options.completedAt ?? state.completedAt,
    options.recordId,
  )
  const dailyDate =
    options.dailyDate === undefined
      ? dailyDateFromPuzzle(state)
      : options.dailyDate

  const db = await database()
  if (db !== null) {
    try {
      const transaction = db.transaction('stats', 'readwrite')
      const current = sanitizeStats(
        (await transaction.store.get(STATS_KEY)) ?? EMPTY_STATS,
      )
      const stats = addGameRecord(current, record, dailyDate)
      await transaction.store.put(stats, STATS_KEY)
      await transaction.done
      writeFallback('stats', FALLBACK_KEYS.stats, stats)
      return { record, stats }
    } catch {
      // Continue with the serialized fallback path.
    }
  }

  const current = sanitizeStats(
    readFallback('stats', FALLBACK_KEYS.stats) ?? EMPTY_STATS,
  )
  const stats = addGameRecord(current, record, dailyDate)
  writeFallback('stats', FALLBACK_KEYS.stats, stats)
  return { record, stats }
}

export async function storageBackend(): Promise<StorageBackend> {
  return (await database()) === null ? 'fallback' : 'indexeddb'
}

/**
 * Test hook: closes the lazy connection and clears only this module's fallback
 * mirrors. It intentionally does not delete the user's IndexedDB database.
 */
export function resetFallbackStorageForTests(): void {
  fallbackMemory.session = null
  fallbackMemory.settings = null
  fallbackMemory.stats = null
  const storage = localStorageOrNull()
  if (storage !== null) {
    for (const key of Object.values(FALLBACK_KEYS)) {
      try {
        storage.removeItem(key)
      } catch {
        break
      }
    }
  }
  void databasePromise?.then((db) => db?.close())
  databasePromise = null
}
