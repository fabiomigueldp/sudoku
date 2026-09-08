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
  ARCHIVED_GAME_VERSION,
  archivedGameSummary,
  createArchivedGame,
  gameKindFromState,
  practiceTechniqueFromPuzzle,
  replayMatchesArchivedState,
  replaySettingsFromGameSettings,
  type ArchivedGame,
  type ArchivedGameSummary,
  type GameKind,
  type ReplaySettings,
} from './archive'

export {
  EMPTY_PRACTICE_PROGRESS,
  PRACTICE_PROGRESS_VERSION,
  addPracticeRecord,
  createPracticeRecord,
  type PracticeProgress,
  type PracticeRecord,
} from './practiceProgress'

export {
  buildReviewFrames,
  type ReviewAssessment,
  type ReviewDelta,
  type ReviewFrame,
} from './review'

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
  checkpointActiveSession,
  clearAllStoredData,
  clearActiveSession,
  deleteSavedSession,
  listSavedGameSummaries,
  listSavedSessions,
  loadSavedSession,
  listArchivedGames,
  listArchivedGameSummaries,
  loadActiveSession,
  loadArchivedGame,
  loadPracticeProgress,
  loadSettings,
  loadStoredDataSnapshot,
  loadStats,
  migrateArchivedGame,
  migrateSession,
  replaceStoredData,
  resetFallbackStorageForTests,
  sanitizePracticeProgress,
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
  type StoredDataSnapshot,
  type StorageBackend,
  type StorageWriteResult,
} from './persistence'

export {
  createSessionId,
  savedGameSummary,
  type SavedGameSummary,
} from './sessions'

export {
  DATA_BACKUP_FORMAT,
  DATA_BACKUP_VERSION,
  SudokuBackupError,
  exportDataBackup,
  parseDataBackup,
  restoreDataBackup,
  type BackupRestoreResult,
  type BackupSummary,
} from './backup'

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
