export {
  BOARD_SIZE,
  EMPTY_CELL,
  assertPuzzleDefinition,
  boardFromCells,
  capSnapshots,
  cloneCell,
  cloneCells,
  cloneSnapshot,
  createCells,
  createGameState,
  isBoardComplete,
  isCellIndex,
  snapshotGame,
  type CreateGameOptions,
} from './state'

export {
  advanceClock,
  createGameClock,
  elapsedAt,
  formatElapsedTime,
  pauseAt,
  resumeAt,
  type GameClock,
  type GameClockOptions,
} from './clock'

export {
  DEFAULT_REDUCER_OPTIONS,
  DIGIT_COLOR_MAP,
  createGameReducer,
  gameActions,
  gameReducer,
  reduceGame,
  type EraseScope,
  type GameAction,
  type GameReducerOptions,
  type SelectionBehavior,
} from './reducer'

export {
  EVENT_LOG_VERSION,
  appendGameEvent,
  applyGameEvent,
  createEventLog,
  reduceAndRecord,
  replayEventLog,
  type GameEvent,
  type GameEventLog,
  type ReducedGameEvent,
} from './events'

export {
  addGameRecord,
  bestTime,
  cloneStats,
  createGameRecord,
  dailyDateFromPuzzle,
  emptyPlayerStats,
  isoDateFromTimestamp,
  isValidIsoDate,
  recordGameCompletion,
  type CompletionResult,
} from './stats'

export {
  STORAGE_SCHEMA_VERSION,
  clearActiveSession,
  loadActiveSession,
  loadSettings,
  loadStats,
  migrateSession,
  resetFallbackStorageForTests,
  sanitizeSettings,
  sanitizeStats,
  saveActiveSession,
  saveGameCompletion,
  saveSettings,
  saveStats,
  storageBackend,
  type LoadSessionOptions,
  type PersistedGameSession,
  type SaveCompletionOptions,
  type StorageBackend,
  type StorageWriteResult,
} from './persistence'

export {
  GAME_SNAPSHOT_PREFIX,
  GAME_SNAPSHOT_VERSION,
  SudokuShareError,
  exportGameSnapshot,
  exportPuzzleString,
  importGameSnapshot,
  parseImportedPuzzle,
  type SudokuShareErrorCode,
} from './share'
