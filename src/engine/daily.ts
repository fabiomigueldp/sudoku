import type { DifficultyId, VariantId } from '../domain/types'
import { GENERATOR_VERSION } from './generator'

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
