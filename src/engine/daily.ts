import type { DifficultyId, VariantId } from '../domain/types'
import { GENERATOR_VERSION } from './generator'

export const DAILY_SCHEDULE: ReadonlyArray<{
  variant: VariantId
  difficulty: DifficultyId
}> = [
  { variant: 'classic', difficulty: 'focused' },
  { variant: 'classic', difficulty: 'challenging' },
  { variant: 'diagonal', difficulty: 'focused' },
  { variant: 'classic', difficulty: 'expert' },
  { variant: 'anti-knight', difficulty: 'focused' },
  { variant: 'diagonal', difficulty: 'challenging' },
  { variant: 'classic', difficulty: 'master' },
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Calendar key in the device's local timezone, intentionally not UTC. */
export function localDateKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid date')
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function normalizeDateKey(date: Date | string): string {
  if (date instanceof Date) return localDateKey(date)

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    throw new RangeError('Date strings must use the YYYY-MM-DD format')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(year, month - 1, day)

  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    throw new RangeError('Invalid calendar date')
  }

  return date
}

/**
 * Stable seed shared by every device for a given local calendar date and mode.
 */
export function dailySeed(
  date: Date | string = new Date(),
  variant: VariantId = 'classic',
  difficulty: DifficultyId = 'focused',
): string {
  return `absolute-sudoku:daily:v2:g${GENERATOR_VERSION}:${normalizeDateKey(date)}:${variant}:${difficulty}`
}

export function dailyProfile(date: Date | string = new Date()) {
  const ordinal = Math.floor(Date.parse(`${normalizeDateKey(date)}T00:00:00Z`) / 86_400_000)
  const index = ((ordinal % DAILY_SCHEDULE.length) + DAILY_SCHEDULE.length) % DAILY_SCHEDULE.length
  return DAILY_SCHEDULE[index]!
}

/** A saved daily remains today's attempt across generator upgrades. */
export function matchesDailySeed(
  seed: string,
  date: Date | string,
  variant: VariantId,
  difficulty: DifficultyId,
): boolean {
  const match = /^absolute-sudoku:daily:v2:g\d+:(.+)$/.exec(seed)
  return match?.[1] === `${normalizeDateKey(date)}:${variant}:${difficulty}`
}
