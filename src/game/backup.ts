import { DEFAULT_SETTINGS, EMPTY_STATS } from '../domain/catalog'
import {
  loadStoredDataSnapshot,
  migrateArchivedGame,
  migrateSession,
  replaceStoredData,
  sanitizePracticeProgress,
  sanitizeSettings,
  sanitizeStats,
  type StoredDataSnapshot,
  type StorageWriteResult,
} from './persistence'

export const DATA_BACKUP_VERSION = 2 as const
export const DATA_BACKUP_FORMAT = 'absolute-sudoku-backup' as const

interface BackupPayload {
  session: unknown
  sessions: unknown[]
  settings: unknown
  stats: unknown
  archives: unknown[]
  practice: unknown
}

interface BackupDocument {
  format: typeof DATA_BACKUP_FORMAT
  version: typeof DATA_BACKUP_VERSION
  exportedAt: number
  checksum: string
  data: BackupPayload
}

export interface BackupSummary {
  exportedAt: number
  hasActiveSession: boolean
  savedGames: number
  archivedGames: number
  practiceSessions: number
}

export interface BackupRestoreResult extends BackupSummary {
  storage: StorageWriteResult
}

export class SudokuBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SudokuBackupError'
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function checksum(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function summary(
  exportedAt: number,
  snapshot: StoredDataSnapshot,
): BackupSummary {
  return {
    exportedAt,
    hasActiveSession: snapshot.session !== null,
    savedGames: snapshot.sessions.length,
    archivedGames: snapshot.archives.length,
    practiceSessions: snapshot.practice.records.length,
  }
}

export async function exportDataBackup(
  exportedAt = Date.now(),
): Promise<{ serialized: string; summary: BackupSummary }> {
  const snapshot = await loadStoredDataSnapshot()
  const data: BackupPayload = {
    session: snapshot.session,
    sessions: snapshot.sessions,
    settings: snapshot.settings,
    stats: snapshot.stats,
    archives: snapshot.archives,
    practice: snapshot.practice,
  }
  const document: BackupDocument = {
    format: DATA_BACKUP_FORMAT,
    version: DATA_BACKUP_VERSION,
    exportedAt,
    checksum: checksum(JSON.stringify(data)),
    data,
  }
  return {
    serialized: JSON.stringify(document, null, 2),
    summary: summary(exportedAt, snapshot),
  }
}

export function parseDataBackup(serialized: string): {
  snapshot: StoredDataSnapshot
  summary: BackupSummary
} {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new SudokuBackupError('O arquivo não contém um backup válido.')
  }
  if (!isObject(value) || value.format !== DATA_BACKUP_FORMAT) {
    throw new SudokuBackupError('Este arquivo não pertence ao Absolute Sudoku.')
  }
  if (value.version !== 1 && value.version !== DATA_BACKUP_VERSION) {
    throw new SudokuBackupError('Esta versão de backup ainda não é compatível.')
  }
  if (
    typeof value.exportedAt !== 'number' ||
    !Number.isFinite(value.exportedAt) ||
    typeof value.checksum !== 'string' ||
    !isObject(value.data)
  ) {
    throw new SudokuBackupError('O backup está incompleto ou corrompido.')
  }
  if (checksum(JSON.stringify(value.data)) !== value.checksum) {
    throw new SudokuBackupError('O conteúdo do backup foi alterado ou corrompido.')
  }

  const session =
    value.data.session === null
      ? null
      : migrateSession(value.data.session)
  if (value.data.session !== null && session === null) {
    throw new SudokuBackupError('A partida ativa do backup é inválida.')
  }
  const rawSessions = value.version === 1
    ? session && session.state.status !== 'completed' ? [session] : []
    : value.data.sessions
  if (!Array.isArray(rawSessions)) {
    throw new SudokuBackupError('A lista de partidas salvas está incompleta.')
  }
  const sessions = rawSessions.map(migrateSession)
  if (sessions.some((entry) => entry === null || entry.state.status === 'completed')) {
    throw new SudokuBackupError('Uma das partidas salvas está corrompida.')
  }
  const validSessions = sessions.filter((entry) => entry !== null)
  if (new Set(validSessions.map((entry) => entry.id)).size !== validSessions.length) {
    throw new SudokuBackupError('O backup contém identificadores de partidas repetidos.')
  }
  // Older backups only have the active envelope; keep that attempt in the library.
  if (session && session.state.status !== 'completed' &&
    !validSessions.some((entry) => entry.id === session.id)) {
    validSessions.push(session)
  }
  const rawArchives = Array.isArray(value.data.archives)
    ? value.data.archives
    : []
  const archives = rawArchives.flatMap((entry) => {
    const archived = migrateArchivedGame(entry)
    return archived === null ? [] : [archived]
  })
  if (archives.length !== rawArchives.length) {
    throw new SudokuBackupError('Uma das partidas arquivadas está corrompida.')
  }
  const snapshot: StoredDataSnapshot = {
    session,
    sessions: validSessions,
    settings: sanitizeSettings(value.data.settings ?? DEFAULT_SETTINGS),
    stats: sanitizeStats(value.data.stats ?? EMPTY_STATS),
    archives,
    practice: sanitizePracticeProgress(value.data.practice),
  }
  return {
    snapshot,
    summary: summary(value.exportedAt, snapshot),
  }
}

export async function restoreDataBackup(
  serialized: string,
): Promise<BackupRestoreResult> {
  const parsed = parseDataBackup(serialized)
  const storage = await replaceStoredData(parsed.snapshot)
  return { ...parsed.summary, storage }
}
