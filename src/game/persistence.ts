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
  ARCHIVED_GAME_VERSION,
  archivedGameSummary,
  createArchivedGame,
  replayMatchesArchivedState,
  type ArchivedGame,
  type ArchivedGameSummary,
  type GameKind,
  type ReplaySettings,
} from './archive'
import {
  EVENT_LOG_VERSION,
  type GameEventLog,
} from './events'
import {
  EMPTY_PRACTICE_PROGRESS,
  PRACTICE_PROGRESS_VERSION,
  addPracticeRecord,
  createPracticeRecord,
  type PracticeProgress,
  type PracticeRecord,
} from './practiceProgress'
import { assertPuzzleDefinition, BOARD_SIZE } from './state'
import { legacySessionId, savedGameSummary, type SavedGameSummary } from './sessions'
import {
  addGameRecord,
  createGameRecord,
  dailyDateFromPuzzle,
  type CompletionResult,
} from './stats'

export const STORAGE_SCHEMA_VERSION = 4
const DATABASE_VERSION = 5
const DATABASE_NAME = 'absolute-sudoku'

const ACTIVE_SESSION_KEY = 'active' as const
const SETTINGS_KEY = 'game' as const
const STATS_KEY = 'player' as const
const PRACTICE_KEY = 'progress' as const
const METADATA_KEY = 'schema' as const

const FALLBACK_KEYS = {
  session: 'absolute-sudoku:session:v2',
  checkpoint: 'absolute-sudoku:checkpoint:v1',
  settings: 'absolute-sudoku:settings:v2',
  stats: 'absolute-sudoku:stats:v2',
  archives: 'absolute-sudoku:archives:v1',
  practice: 'absolute-sudoku:practice:v1',
} as const

export interface PersistedGameSession {
  id: string
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
  savedSessions: {
    key: string
    value: PersistedGameSession
  }
  savedIndex: {
    key: string
    value: SavedGameSummary
  }
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
  archives: {
    key: string
    value: ArchivedGame
    indexes: { 'by-completed-at': number }
  }
  archiveIndex: {
    key: string
    value: ArchivedGameSummary
    indexes: { 'by-completed-at': number }
  }
  practice: {
    key: typeof PRACTICE_KEY
    value: PracticeProgress
  }
  metadata: {
    key: typeof METADATA_KEY
    value: StorageMetadata
  }
}

export type StorageBackend = 'indexeddb' | 'fallback'

export interface StorageWriteResult {
  backend: StorageBackend
  durable?: boolean
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
  sessionId?: string
  completedAt?: number
  dailyDate?: string | null
  recordId?: string
  eventLog?: GameEventLog | null
  replaySettings?: ReplaySettings
  kind?: GameKind
}

export interface StoredDataSnapshot {
  session: PersistedGameSession | null
  sessions: PersistedGameSession[]
  settings: GameSettings
  stats: PlayerStats
  archives: ArchivedGame[]
  practice: PracticeProgress
}

interface FallbackMemory {
  session: PersistedGameSession | null
  checkpoint: PersistedGameSession | null
  settings: GameSettings | null
  stats: PlayerStats | null
  archives: ArchivedGame[]
  practice: PracticeProgress | null
}

const fallbackMemory: FallbackMemory = {
  session: null,
  checkpoint: null,
  settings: null,
  stats: null,
  archives: [],
  practice: null,
}

const SAVED_SESSION_PREFIX = 'absolute-sudoku:saved:v1:'
const savedSessionMemory = new Map<string, PersistedGameSession>()

let databasePromise: Promise<IDBPDatabase<AbsoluteSudokuDatabase> | null> | null =
  null
let storageWriteQueue: Promise<void> = Promise.resolve()

function enqueueStorageWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = storageWriteQueue.then(work, work)
  storageWriteQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

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
): boolean {
  ;(fallbackMemory as Record<keyof FallbackMemory, unknown>)[key] =
    value === null ? null : cloneJson(value)

  const storage = localStorageOrNull()
  if (storage === null) return false
  try {
    if (value === null) storage.removeItem(storageKey)
    else storage.setItem(storageKey, JSON.stringify(value))
    return true
  } catch {
    // Memory remains a safe fallback for quota, privacy and security failures.
    return false
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
  name:
    | 'sessions'
    | 'settings'
    | 'stats'
    | 'archives'
    | 'archiveIndex'
    | 'practice'
    | 'metadata',
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
        if (!db.objectStoreNames.contains('savedSessions')) db.createObjectStore('savedSessions')
        if (!db.objectStoreNames.contains('savedIndex')) db.createObjectStore('savedIndex')
        if (!hasStore(db, 'sessions')) db.createObjectStore('sessions')
        if (!hasStore(db, 'settings')) db.createObjectStore('settings')
        if (!hasStore(db, 'stats')) db.createObjectStore('stats')
        if (!hasStore(db, 'archives')) {
          const archives = db.createObjectStore('archives')
          archives.createIndex('by-completed-at', 'state.completedAt')
        } else {
          const archives = transaction.objectStore('archives')
          if (!archives.indexNames.contains('by-completed-at')) {
            archives.createIndex('by-completed-at', 'state.completedAt')
          }
        }
        if (!hasStore(db, 'archiveIndex')) {
          const archiveIndex = db.createObjectStore('archiveIndex')
          archiveIndex.createIndex('by-completed-at', 'completedAt')
        }
        if (!hasStore(db, 'practice')) db.createObjectStore('practice')
        if (!hasStore(db, 'metadata')) db.createObjectStore('metadata')

        // v5 adds independent in-progress attempts and their lightweight index.
        // The previous active envelope is retained and migrated lazily on read.
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

const PRACTICE_TECHNIQUES = new Set([
  'naked-single',
  'hidden-single',
  'locked-candidates-pointing',
  'locked-candidates-claiming',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'hidden-triple',
  'naked-quad',
  'hidden-quad',
  'x-wing',
  'skyscraper',
  'swordfish',
  'xy-wing',
  'jellyfish',
])

function validReplaySettings(value: unknown): value is ReplaySettings {
  return (
    isObject(value) &&
    typeof value.autoRemoveCandidates === 'boolean' &&
    (value.errorPolicy === 'conflicts' ||
      value.errorPolicy === 'solution' ||
      value.errorPolicy === 'on-demand' ||
      value.errorPolicy === 'completion')
  )
}

export function migrateArchivedGame(value: unknown): ArchivedGame | null {
  if (!isObject(value) || !validState(value.state)) return null
  if (value.state.status !== 'completed' || value.state.completedAt === null) {
    return null
  }
  const kind =
    value.kind === 'daily' ||
    value.kind === 'practice' ||
    value.kind === 'standard'
      ? value.kind
      : 'standard'
  const practiceTechnique =
    kind === 'practice' &&
    typeof value.practiceTechnique === 'string' &&
    PRACTICE_TECHNIQUES.has(value.practiceTechnique)
      ? value.practiceTechnique
      : null
  const replaySettings = validReplaySettings(value.replaySettings)
    ? value.replaySettings
    : {
        autoRemoveCandidates: DEFAULT_SETTINGS.autoRemoveCandidates,
        errorPolicy: DEFAULT_SETTINGS.errorPolicy,
      }
  const eventLog =
    validEventLog(value.eventLog) &&
    replayMatchesArchivedState(value.state, value.eventLog, replaySettings)
      ? value.eventLog
      : null
  return {
    version: ARCHIVED_GAME_VERSION,
    id:
      typeof value.id === 'string'
        ? value.id
        : `${value.state.puzzle.id}:${value.state.completedAt}`,
    savedAt:
      typeof value.savedAt === 'number' && Number.isFinite(value.savedAt)
        ? value.savedAt
        : value.state.completedAt,
    kind,
    practiceTechnique,
    state: cloneJson(value.state),
    eventLog: eventLog === null ? null : cloneJson(eventLog),
    replaySettings: { ...replaySettings },
  } as ArchivedGame
}

function validPracticeRecord(value: unknown): value is PracticeRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.puzzleId === 'string' &&
    typeof value.technique === 'string' &&
    PRACTICE_TECHNIQUES.has(value.technique) &&
    typeof value.elapsedMs === 'number' &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    typeof value.mistakes === 'number' &&
    Number.isFinite(value.mistakes) &&
    value.mistakes >= 0 &&
    typeof value.hintsUsed === 'number' &&
    Number.isFinite(value.hintsUsed) &&
    value.hintsUsed >= 0 &&
    typeof value.completedAt === 'number' &&
    Number.isFinite(value.completedAt)
  )
}

export function sanitizePracticeProgress(value: unknown): PracticeProgress {
  const source = isObject(value) ? value : {}
  const records = Array.isArray(source.records)
    ? source.records
        .filter(validPracticeRecord)
        .map((record) => ({ ...record }))
    : []
  return {
    version: PRACTICE_PROGRESS_VERSION,
    records: [...new Map(records.map((record) => [record.id, record])).values()],
  }
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
  const eventLog = validEventLog(eventLogCandidate) &&
    eventLogCandidate.puzzle.id === stateCandidate.puzzle.id
    ? cloneJson(eventLogCandidate)
    : null
  return {
    id: typeof value.id === 'string' && value.id.length > 0
      ? value.id
      : legacySessionId(stateCandidate, eventLog),
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt:
      typeof savedAtCandidate === 'number' && Number.isFinite(savedAtCandidate)
        ? savedAtCandidate
        : 0,
    state: cloneJson(stateCandidate),
    eventLog,
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

function fallbackSessionKey(id: string): string {
  return `${SAVED_SESSION_PREFIX}${encodeURIComponent(id)}`
}

function readFallbackSessions(): PersistedGameSession[] {
  const sessions = new Map(savedSessionMemory)
  const storage = localStorageOrNull()
  if (storage !== null) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (!key?.startsWith(SAVED_SESSION_PREFIX)) continue
        try {
          const session = migrateSession(JSON.parse(storage.getItem(key) ?? 'null'))
          const previous = session && sessions.get(session.id)
          if (session && (!previous || session.savedAt >= previous.savedAt)) {
            sessions.set(session.id, session)
          }
        } catch {
          // A damaged attempt must not hide any of the other saved games.
        }
      }
    } catch {
      // Private browsing can make storage unavailable mid-session.
    }
  }
  return [...sessions.values()]
}

function writeFallbackSession(session: PersistedGameSession): boolean {
  savedSessionMemory.set(session.id, cloneJson(session))
  try {
    const storage = localStorageOrNull()
    if (storage === null) return false
    storage.setItem(fallbackSessionKey(session.id), JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

function removeFallbackSession(id: string): void {
  savedSessionMemory.delete(id)
  localStorageOrNull()?.removeItem(fallbackSessionKey(id))
}

async function writeSession(
  session: PersistedGameSession,
  makeActive: boolean,
): Promise<StorageWriteResult> {
  try {
    const db = await database()
    if (db !== null) {
      const transaction = db.transaction(['sessions', 'savedSessions', 'savedIndex'], 'readwrite')
      const saved = transaction.objectStore('savedSessions')
      const index = transaction.objectStore('savedIndex')
      const previous = await saved.get(session.id)
      if (!previous || session.savedAt >= previous.savedAt) {
        if (session.state.status === 'completed') {
          await saved.delete(session.id)
          await index.delete(session.id)
        } else {
          await saved.put(session, session.id)
          await index.put(savedGameSummary(session.id, session.state, session.savedAt), session.id)
        }
      }
      if (makeActive) {
        const newest = previous && previous.savedAt > session.savedAt ? previous : session
        await transaction.objectStore('sessions').put(newest, ACTIVE_SESSION_KEY)
      }
      await transaction.done
      // A stale fallback must never override a newer IndexedDB value.
      try { removeFallbackSession(session.id) } catch { /* Read picks the newest copy. */ }
      return { backend: 'indexeddb', durable: true }
    }
  } catch {
    // Store attempts separately: one long history cannot overwrite another.
  }
  const durable = writeFallbackSession(session)
  if (makeActive) writeFallback('session', FALLBACK_KEYS.session, session)
  return { backend: 'fallback', durable }
}

async function recoveryCopies(fallbacks: PersistedGameSession[]): Promise<PersistedGameSession[]> {
  const copies = [
    ...fallbacks,
    await readDatabaseStore('sessions', ACTIVE_SESSION_KEY),
    readFallback('session', FALLBACK_KEYS.session),
    readFallback('checkpoint', FALLBACK_KEYS.checkpoint),
  ].flatMap((value) => {
    const session = migrateSession(value)
    return session ? [session] : []
  })
  return copies.sort((left, right) => left.savedAt - right.savedAt)
}

/** Promote old single-slot saves and interrupted writes without discarding either attempt. */
async function recoverSessionCopies(): Promise<PersistedGameSession | null> {
  const fallbacks = readFallbackSessions()
  const fallbackById = new Map(fallbacks.map((session) => [session.id, session]))
  const copies = await recoveryCopies(fallbacks)
  for (const session of copies) {
    const db = await database()
    let existing: PersistedGameSession | null = null
    try {
      existing = db ? migrateSession(await db.get('savedSessions', session.id)) : null
    } catch { /* The fallback is checked below. */ }
    existing ??= fallbackById.get(session.id) ?? null
    if (!existing || session.savedAt > existing.savedAt) {
      await writeSession(session, false)
    }
  }
  return copies.at(-1) ?? null
}

async function readSavedSessionCopy(id: string): Promise<PersistedGameSession | null> {
  let session: PersistedGameSession | null = null
  try {
    const db = await database()
    session = db ? migrateSession(await db.get('savedSessions', id)) : null
  } catch { /* Try this attempt's fallback. */ }
  const fallback = readFallbackSessions().find((entry) => entry.id === id)
  if (fallback && (!session || fallback.savedAt >= session.savedAt)) session = fallback
  return session
}

export function saveActiveSession(
  state: GameState,
  eventLog: GameEventLog | null = null,
  savedAt = Date.now(),
  id = legacySessionId(state, eventLog),
): Promise<StorageWriteResult> {
  const session: PersistedGameSession = {
    id,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt,
    state: cloneJson(state),
    eventLog: eventLog === null ? null : cloneJson(eventLog),
  }
  return enqueueStorageWrite(() => writeSession(session, true))
}

/** Synchronous recovery copy for pagehide, when IndexedDB writes may be aborted. */
export function checkpointActiveSession(
  state: GameState,
  eventLog: GameEventLog | null = null,
  savedAt = Date.now(),
  id = legacySessionId(state, eventLog),
): void {
  writeFallback('checkpoint', FALLBACK_KEYS.checkpoint, {
    id,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt,
    state,
    eventLog,
  })
}

function rebaseSession(
  session: PersistedGameSession | null,
  options: LoadSessionOptions,
): PersistedGameSession | null {
  if (session === null) return null
  const restored = cloneJson(session)
  if ((options.rebaseRunningClock ?? true) && restored.state.status === 'playing') {
    restored.state.lastResumedAt = options.now ?? Date.now()
  }
  return restored
}

export function loadActiveSession(
  options: LoadSessionOptions = {},
): Promise<PersistedGameSession | null> {
  return enqueueStorageWrite(async () => {
    const active = await recoverSessionCopies()
    const saved = active ? await readSavedSessionCopy(active.id) : null
    const newest = saved && active && saved.savedAt > active.savedAt ? saved : active
    return rebaseSession(newest, options)
  })
}

export function listSavedGameSummaries(): Promise<SavedGameSummary[]> {
  return enqueueStorageWrite(async () => {
    await recoverSessionCopies()
    const summaries = new Map<string, SavedGameSummary>()
    try {
      const db = await database()
      for (const entry of db ? await db.getAll('savedIndex') : []) summaries.set(entry.id, entry)
    } catch { /* Merge recovery copies below. */ }
    for (const session of readFallbackSessions()) {
      const previous = summaries.get(session.id)
      if (previous && previous.savedAt > session.savedAt) continue
      if (session.state.status === 'completed') summaries.delete(session.id)
      else summaries.set(session.id, savedGameSummary(session.id, session.state, session.savedAt))
    }
    return [...summaries.values()].sort((left, right) => right.savedAt - left.savedAt || left.id.localeCompare(right.id))
  })
}

export function loadSavedSession(
  id: string,
  options: LoadSessionOptions = {},
): Promise<PersistedGameSession | null> {
  return enqueueStorageWrite(async () => {
    await recoverSessionCopies()
    return rebaseSession(await readSavedSessionCopy(id), options)
  })
}

export function listSavedSessions(): Promise<PersistedGameSession[]> {
  return enqueueStorageWrite(async () => {
    await recoverSessionCopies()
    const sessions = new Map<string, PersistedGameSession>()
    try {
      const db = await database()
      for (const value of db ? await db.getAll('savedSessions') : []) {
        const session = migrateSession(value)
        if (session) sessions.set(session.id, session)
      }
    } catch { /* Merge each valid fallback independently. */ }
    for (const session of readFallbackSessions()) {
      const previous = sessions.get(session.id)
      if (!previous || session.savedAt >= previous.savedAt) sessions.set(session.id, session)
    }
    return [...sessions.values()]
      .filter((session) => session.state.status !== 'completed')
      .sort((left, right) => right.savedAt - left.savedAt)
  })
}

export function deleteSavedSession(id: string): Promise<StorageWriteResult> {
  return enqueueStorageWrite(async () => {
    const db = await database()
    // Failure is surfaced to the caller. Never pretend a durable deletion succeeded.
    if (db !== null) {
      const transaction = db.transaction(['sessions', 'savedSessions', 'savedIndex'], 'readwrite')
      const active = transaction.objectStore('sessions')
      const current = migrateSession(await active.get(ACTIVE_SESSION_KEY))
      if (current?.id === id) await active.delete(ACTIVE_SESSION_KEY)
      await transaction.objectStore('savedSessions').delete(id)
      await transaction.objectStore('savedIndex').delete(id)
      await transaction.done
    }
    removeFallbackSession(id)
    for (const key of ['session', 'checkpoint'] as const) {
      if (migrateSession(readFallback(key, FALLBACK_KEYS[key]))?.id === id) {
        writeFallback(key, FALLBACK_KEYS[key], null)
      }
    }
    return { backend: db === null ? 'fallback' : 'indexeddb' }
  })
}

export async function clearActiveSession(): Promise<StorageWriteResult> {
  const session = await loadActiveSession({ rebaseRunningClock: false })
  return session ? deleteSavedSession(session.id) : { backend: await storageBackend() }
}

export async function saveSettings(
  settings: GameSettings,
): Promise<StorageWriteResult> {
  const safe = sanitizeSettings(settings)
  return enqueueStorageWrite(async () => {
    writeFallback('settings', FALLBACK_KEYS.settings, safe)
    try {
      const db = await database()
      if (db === null) return { backend: 'fallback' }
      await db.put('settings', safe, SETTINGS_KEY)
      return { backend: 'indexeddb' }
    } catch {
      return { backend: 'fallback' }
    }
  })
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
  return enqueueStorageWrite(async () => {
    writeFallback('stats', FALLBACK_KEYS.stats, safe)
    try {
      const db = await database()
      if (db === null) return { backend: 'fallback' }
      await db.put('stats', safe, STATS_KEY)
      return { backend: 'indexeddb' }
    } catch {
      return { backend: 'fallback' }
    }
  })
}

export async function loadStats(): Promise<PlayerStats> {
  const stored =
    (await readDatabaseStore('stats', STATS_KEY)) ??
    readFallback('stats', FALLBACK_KEYS.stats)
  return sanitizeStats(stored)
}

function sanitizeArchives(value: unknown): ArchivedGame[] {
  if (!Array.isArray(value)) return []
  const archives = value.flatMap((entry) => {
    const archived = migrateArchivedGame(entry)
    return archived === null ? [] : [archived]
  })
  return [...new Map(archives.map((archive) => [archive.id, archive])).values()]
}

export async function listArchivedGames(): Promise<ArchivedGame[]> {
  try {
    const db = await database()
    if (db !== null) {
      const archives = sanitizeArchives(await db.getAll('archives'))
      return archives.sort(
        (left, right) =>
          (right.state.completedAt ?? right.savedAt) -
          (left.state.completedAt ?? left.savedAt),
      )
    }
  } catch {
    // Continue with the local fallback mirror.
  }
  return sanitizeArchives(
    readFallback('archives', FALLBACK_KEYS.archives),
  ).sort(
    (left, right) =>
      (right.state.completedAt ?? right.savedAt) -
      (left.state.completedAt ?? left.savedAt),
  )
}

export async function listArchivedGameSummaries(): Promise<
  ArchivedGameSummary[]
> {
  try {
    const db = await database()
    if (db !== null) {
      const summaries = await db.getAll('archiveIndex')
      return summaries
        .filter(
          (summary) =>
            typeof summary.id === 'string' &&
            typeof summary.completedAt === 'number' &&
            Number.isFinite(summary.completedAt),
        )
        .map((summary) => ({ ...summary }))
        .sort((left, right) => right.completedAt - left.completedAt)
    }
  } catch {
    // Continue with archive values from the fallback mirror.
  }
  return sanitizeArchives(
    readFallback('archives', FALLBACK_KEYS.archives),
  )
    .map(archivedGameSummary)
    .sort((left, right) => right.completedAt - left.completedAt)
}

export async function loadArchivedGame(
  id: string,
): Promise<ArchivedGame | null> {
  if (!id) return null
  try {
    const db = await database()
    if (db !== null) return migrateArchivedGame(await db.get('archives', id))
  } catch {
    // Continue with the local fallback mirror.
  }
  return (
    sanitizeArchives(readFallback('archives', FALLBACK_KEYS.archives)).find(
      (entry) => entry.id === id,
    ) ?? null
  )
}

export async function loadPracticeProgress(): Promise<PracticeProgress> {
  try {
    const db = await database()
    if (db !== null) {
      return sanitizePracticeProgress(
        await db.get('practice', PRACTICE_KEY),
      )
    }
  } catch {
    // Continue with the local fallback mirror.
  }
  return sanitizePracticeProgress(
    readFallback('practice', FALLBACK_KEYS.practice),
  )
}

export async function saveGameCompletion(
  state: GameState,
  options: SaveCompletionOptions = {},
): Promise<CompletionResult> {
  const record = createGameRecord(
    state,
    options.completedAt ?? state.completedAt,
    options.recordId ?? options.sessionId,
  )
  const dailyDate =
    options.dailyDate === undefined
      ? dailyDateFromPuzzle(state)
      : options.dailyDate
  const replaySettings = options.replaySettings ?? {
    autoRemoveCandidates: DEFAULT_SETTINGS.autoRemoveCandidates,
    errorPolicy: DEFAULT_SETTINGS.errorPolicy,
  }
  const inferredArchive = createArchivedGame(
    state,
    options.eventLog ?? null,
    replaySettings,
  )
  const archiveWithKind: ArchivedGame =
    options.kind === undefined || options.kind === inferredArchive.kind
      ? inferredArchive
      : {
          ...inferredArchive,
          kind: options.kind,
          practiceTechnique:
            options.kind === 'practice'
              ? inferredArchive.practiceTechnique
              : null,
        }
  const archive: ArchivedGame = {
    ...archiveWithKind,
    id: record.id,
  }
  const practiceRecord = createPracticeRecord(state)
  if (practiceRecord !== null) practiceRecord.id = record.id
  const completedSession: PersistedGameSession = {
    id: options.sessionId ?? legacySessionId(state, options.eventLog ?? null),
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt: Date.now(),
    state: cloneJson(state),
    eventLog: options.eventLog ?? null,
  }

  return enqueueStorageWrite(async () => {
    const db = await database()
    if (db !== null) {
      try {
        const transaction = db.transaction(
          ['stats', 'archives', 'archiveIndex', 'practice', 'sessions', 'savedSessions', 'savedIndex'],
          'readwrite',
        )
        const statsStore = transaction.objectStore('stats')
        const archiveStore = transaction.objectStore('archives')
        const archiveIndexStore = transaction.objectStore('archiveIndex')
        const practiceStore = transaction.objectStore('practice')
        const currentStats = sanitizeStats(
          (await statsStore.get(STATS_KEY)) ?? EMPTY_STATS,
        )
        const currentPractice = sanitizePracticeProgress(
          (await practiceStore.get(PRACTICE_KEY)) ?? EMPTY_PRACTICE_PROGRESS,
        )
        const stats =
          archive.kind === 'practice'
            ? currentStats
            : addGameRecord(currentStats, record, dailyDate)
        const practice =
          archive.kind === 'practice' && practiceRecord !== null
            ? addPracticeRecord(currentPractice, practiceRecord)
            : currentPractice

        await archiveStore.put(archive, archive.id)
        await archiveIndexStore.put(archivedGameSummary(archive), archive.id)
        await statsStore.put(stats, STATS_KEY)
        await practiceStore.put(practice, PRACTICE_KEY)
        await transaction.objectStore('savedSessions').delete(completedSession.id)
        await transaction.objectStore('savedIndex').delete(completedSession.id)
        const activeStore = transaction.objectStore('sessions')
        if (migrateSession(await activeStore.get(ACTIVE_SESSION_KEY))?.id === completedSession.id) {
          await activeStore.put(completedSession, ACTIVE_SESSION_KEY)
        }
        await transaction.done
        try { removeFallbackSession(completedSession.id) } catch { /* Completion remains recoverable below. */ }
        for (const key of ['session', 'checkpoint'] as const) {
          if (migrateSession(readFallback(key, FALLBACK_KEYS[key]))?.id === completedSession.id) {
            writeFallback(key, FALLBACK_KEYS[key], completedSession)
          }
        }

        const fallbackArchives = sanitizeArchives(
          readFallback('archives', FALLBACK_KEYS.archives),
        ).filter((entry) => entry.id !== archive.id)
        writeFallback('archives', FALLBACK_KEYS.archives, [
          ...fallbackArchives,
          archive,
        ])
        writeFallback('stats', FALLBACK_KEYS.stats, stats)
        writeFallback('practice', FALLBACK_KEYS.practice, practice)
        return { record, stats }
      } catch {
        // Continue with the serialized fallback path.
      }
    }

    const currentStats = sanitizeStats(
      readFallback('stats', FALLBACK_KEYS.stats) ?? EMPTY_STATS,
    )
    const currentPractice = sanitizePracticeProgress(
      readFallback('practice', FALLBACK_KEYS.practice),
    )
    const stats =
      archive.kind === 'practice'
        ? currentStats
        : addGameRecord(currentStats, record, dailyDate)
    const practice =
      archive.kind === 'practice' && practiceRecord !== null
        ? addPracticeRecord(currentPractice, practiceRecord)
        : currentPractice
    const archives = sanitizeArchives(
      readFallback('archives', FALLBACK_KEYS.archives),
    ).filter((entry) => entry.id !== archive.id)
    writeFallback('archives', FALLBACK_KEYS.archives, [...archives, archive])
    writeFallback('stats', FALLBACK_KEYS.stats, stats)
    writeFallback('practice', FALLBACK_KEYS.practice, practice)
    writeFallbackSession(completedSession)
    for (const key of ['session', 'checkpoint'] as const) {
      if (migrateSession(readFallback(key, FALLBACK_KEYS[key]))?.id === completedSession.id) {
        writeFallback(key, FALLBACK_KEYS[key], completedSession)
      }
    }
    return { record, stats }
  })
}

export async function loadStoredDataSnapshot(): Promise<StoredDataSnapshot> {
  const [session, settings, stats, archives, practice, sessions] = await Promise.all([
    loadActiveSession({ rebaseRunningClock: false }),
    loadSettings(),
    loadStats(),
    listArchivedGames(),
    loadPracticeProgress(),
    listSavedSessions(),
  ])
  return { session, sessions, settings, stats, archives, practice }
}

export function replaceStoredData(
  snapshot: StoredDataSnapshot,
): Promise<StorageWriteResult> {
  const safe: StoredDataSnapshot = {
    sessions: snapshot.sessions.flatMap((value) => {
      const session = migrateSession(value)
      return session && session.state.status !== 'completed' ? [session] : []
    }),
    session:
      snapshot.session === null ? null : migrateSession(snapshot.session),
    settings: sanitizeSettings(snapshot.settings),
    stats: sanitizeStats(snapshot.stats),
    archives: sanitizeArchives(snapshot.archives),
    practice: sanitizePracticeProgress(snapshot.practice),
  }

  return enqueueStorageWrite(async () => {
    const db = await database()
    try {
      if (db !== null) {
        const transaction = db.transaction(
          [
            'sessions',
            'savedSessions',
            'savedIndex',
            'settings',
            'stats',
            'archives',
            'archiveIndex',
            'practice',
          ],
          'readwrite',
        )
        const sessions = transaction.objectStore('sessions')
        const settings = transaction.objectStore('settings')
        const stats = transaction.objectStore('stats')
        const archives = transaction.objectStore('archives')
        const archiveIndex = transaction.objectStore('archiveIndex')
        const practice = transaction.objectStore('practice')
        await sessions.clear()
        await transaction.objectStore('savedSessions').clear()
        await transaction.objectStore('savedIndex').clear()
        for (const session of safe.sessions) {
          await transaction.objectStore('savedSessions').put(session, session.id)
          await transaction.objectStore('savedIndex').put(
            savedGameSummary(session.id, session.state, session.savedAt), session.id,
          )
        }
        await archives.clear()
        await archiveIndex.clear()
        if (safe.session !== null) {
          await sessions.put(safe.session, ACTIVE_SESSION_KEY)
        }
        await settings.put(safe.settings, SETTINGS_KEY)
        await stats.put(safe.stats, STATS_KEY)
        for (const archived of safe.archives) {
          await archives.put(archived, archived.id)
          await archiveIndex.put(archivedGameSummary(archived), archived.id)
        }
        await practice.put(safe.practice, PRACTICE_KEY)
        await transaction.done
      }
    } catch {
      throw new Error('Não foi possível substituir os dados. O conteúdo anterior foi preservado.')
    }

    for (const session of readFallbackSessions()) removeFallbackSession(session.id)
    const writes = [
      ...safe.sessions.map(writeFallbackSession),
      writeFallback('checkpoint', FALLBACK_KEYS.checkpoint, null),
      writeFallback('session', FALLBACK_KEYS.session, safe.session),
      writeFallback('settings', FALLBACK_KEYS.settings, safe.settings),
      writeFallback('stats', FALLBACK_KEYS.stats, safe.stats),
      writeFallback('archives', FALLBACK_KEYS.archives, safe.archives),
      writeFallback('practice', FALLBACK_KEYS.practice, safe.practice),
    ]
    return { backend: db ? 'indexeddb' : 'fallback', durable: db !== null || writes.every(Boolean) }
  })
}

export function clearAllStoredData(): Promise<StorageWriteResult> {
  return replaceStoredData({
    session: null,
    sessions: [],
    settings: DEFAULT_SETTINGS,
    stats: EMPTY_STATS,
    archives: [],
    practice: EMPTY_PRACTICE_PROGRESS,
  })
}

export async function storageBackend(): Promise<StorageBackend> {
  return (await database()) === null ? 'fallback' : 'indexeddb'
}

/**
 * Test hook: closes the lazy connection and clears only this module's fallback
 * mirrors. It intentionally does not delete the user's IndexedDB database.
 */
export function resetFallbackStorageForTests(): void {
  for (const session of readFallbackSessions()) {
    try { removeFallbackSession(session.id) } catch { /* Unavailable storage. */ }
  }
  savedSessionMemory.clear()
  fallbackMemory.session = null
  fallbackMemory.checkpoint = null
  fallbackMemory.settings = null
  fallbackMemory.stats = null
  fallbackMemory.archives = []
  fallbackMemory.practice = null
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
  storageWriteQueue = Promise.resolve()
}
