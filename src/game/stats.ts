import type {
  DifficultyId,
  GameRecord,
  GameState,
  PlayerStats,
  VariantId,
} from '../domain/types'
import { EMPTY_STATS } from '../domain/catalog'
import { isBoardComplete } from './state'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function cloneRecord(record: GameRecord): GameRecord {
  return { ...record }
}

export function cloneStats(stats: PlayerStats): PlayerStats {
  return {
    completed: stats.completed,
    cleanSolves: stats.cleanSolves,
    totalTimeMs: stats.totalTimeMs,
    currentDailyStreak: stats.currentDailyStreak,
    lastDailyDate: stats.lastDailyDate,
    records: stats.records.map(cloneRecord),
  }
}

export function emptyPlayerStats(): PlayerStats {
  return cloneStats(EMPTY_STATS)
}

export function isoDateFromTimestamp(
  timestamp: number,
  timeZone?: string,
): string {
  const date = new Date(timestamp)
  if (timeZone === undefined) return date.toISOString().slice(0, 10)

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

function dayOrdinal(isoDate: string): number | null {
  if (!ISO_DAY.test(isoDate)) return null
  const [yearText, monthText, dayText] = isoDate.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return Math.floor(timestamp / 86_400_000)
}

export function isValidIsoDate(value: string): boolean {
  return dayOrdinal(value) !== null
}

export function dailyDateFromPuzzle(
  state: Pick<GameState, 'puzzle'>,
): string | null {
  const source = `${state.puzzle.id} ${state.puzzle.seed}`
  if (!/\bdaily\b/i.test(source)) return null
  const match = source.match(/\d{4}-\d{2}-\d{2}/)
  return match !== null && isValidIsoDate(match[0]) ? match[0] : null
}

export function createGameRecord(
  state: GameState,
  completedAt = state.completedAt,
  id?: string,
): GameRecord {
  if (!isBoardComplete(state)) {
    throw new Error('Only solved games can be recorded.')
  }
  if (completedAt === null || !Number.isFinite(completedAt)) {
    throw new Error('A completion timestamp is required to create a record.')
  }

  return {
    id: id ?? `${state.puzzle.id}:${completedAt}`,
    puzzleId: state.puzzle.id,
    variant: state.puzzle.variant,
    difficulty: state.puzzle.difficulty,
    elapsedMs: Math.max(0, state.elapsedMs),
    mistakes: Math.max(0, state.mistakes),
    hintsUsed: Math.max(0, state.hintsUsed),
    completedAt,
  }
}

function nextStreak(
  stats: PlayerStats,
  dailyDate: string | null,
): Pick<PlayerStats, 'currentDailyStreak' | 'lastDailyDate'> {
  if (dailyDate === null || !isValidIsoDate(dailyDate)) {
    return {
      currentDailyStreak: stats.currentDailyStreak,
      lastDailyDate: stats.lastDailyDate,
    }
  }

  if (stats.lastDailyDate === dailyDate) {
    return {
      currentDailyStreak: stats.currentDailyStreak,
      lastDailyDate: dailyDate,
    }
  }

  const previous = stats.lastDailyDate === null
    ? null
    : dayOrdinal(stats.lastDailyDate)
  const current = dayOrdinal(dailyDate)
  const consecutive =
    previous !== null && current !== null && current - previous === 1

  return {
    currentDailyStreak: consecutive ? stats.currentDailyStreak + 1 : 1,
    lastDailyDate: dailyDate,
  }
}

export function addGameRecord(
  stats: PlayerStats,
  record: GameRecord,
  dailyDate: string | null = null,
): PlayerStats {
  const existing = stats.records.find((entry) => entry.id === record.id)
  if (existing) {
    const clean = (entry: GameRecord) => entry.mistakes === 0 && entry.hintsUsed === 0 ? 1 : 0
    return {
      ...cloneStats(stats),
      cleanSolves: stats.cleanSolves - clean(existing) + clean(record),
      totalTimeMs: stats.totalTimeMs - existing.elapsedMs + Math.max(0, record.elapsedMs),
      records: stats.records.map((entry) => cloneRecord(entry.id === record.id ? record : entry)),
    }
  }

  const streak = nextStreak(stats, dailyDate)
  return {
    completed: stats.completed + 1,
    cleanSolves:
      stats.cleanSolves +
      (record.mistakes === 0 && record.hintsUsed === 0 ? 1 : 0),
    totalTimeMs: stats.totalTimeMs + Math.max(0, record.elapsedMs),
    currentDailyStreak: streak.currentDailyStreak,
    lastDailyDate: streak.lastDailyDate,
    records: [...stats.records.map(cloneRecord), cloneRecord(record)],
  }
}

export interface CompletionResult {
  record: GameRecord
  stats: PlayerStats
}

export function recordGameCompletion(
  state: GameState,
  stats: PlayerStats,
  options: {
    completedAt?: number
    dailyDate?: string | null
    recordId?: string
  } = {},
): CompletionResult {
  const record = createGameRecord(
    state,
    options.completedAt ?? state.completedAt,
    options.recordId,
  )
  const dailyDate =
    options.dailyDate === undefined
      ? dailyDateFromPuzzle(state)
      : options.dailyDate
  return {
    record,
    stats: addGameRecord(stats, record, dailyDate),
  }
}

export function bestTime(
  stats: PlayerStats,
  variant: VariantId,
  difficulty: DifficultyId,
): number | null {
  let best: number | null = null
  for (const record of stats.records) {
    if (record.variant !== variant || record.difficulty !== difficulty) continue
    best = best === null ? record.elapsedMs : Math.min(best, record.elapsedMs)
  }
  return best
}
