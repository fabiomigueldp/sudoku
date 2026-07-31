import { describe, expect, it } from 'vitest'
import { createSeededRandom, dailySeed, localDateKey } from '../../src/engine'

describe('deterministic random source', () => {
  it('repeats the same stream and shuffle for the same string seed', () => {
    const first = createSeededRandom('vida-inteira')
    const second = createSeededRandom('vida-inteira')

    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => second.next()),
    )
    expect(first.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual(
      second.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    )
  })

  it('uses the local calendar day for daily seeds', () => {
    const morning = new Date(2026, 6, 31, 0, 5)
    const evening = new Date(2026, 6, 31, 23, 55)

    expect(localDateKey(morning)).toBe('2026-07-31')
    expect(dailySeed(morning, 'diagonal', 'expert')).toBe(
      dailySeed(evening, 'diagonal', 'expert'),
    )
    expect(dailySeed('2026-08-01', 'diagonal', 'expert')).not.toBe(
      dailySeed(morning, 'diagonal', 'expert'),
    )
  })
})
