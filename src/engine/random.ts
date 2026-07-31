/**
 * A small, reproducible pseudo-random source.
 *
 * The implementation deliberately avoids Web Crypto and platform state so the
 * same UTF-16 seed produces the same stream in every supported browser.
 */
export interface SeededRandom {
  readonly seed: string
  next(): number
  integer(maxExclusive: number): number
  boolean(probability?: number): boolean
  pick<T>(values: readonly T[]): T
  shuffle<T>(values: readonly T[]): T[]
}

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    return (hash ^= hash >>> 16) >>> 0
  }
}

function mulberry32(initialState: number): () => number {
  let state = initialState >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createSeededRandom(seed: string): SeededRandom {
  const normalizedSeed = String(seed)
  const seedHash = xmur3(normalizedSeed)
  const nextValue = mulberry32(seedHash())

  return {
    seed: normalizedSeed,

    next(): number {
      return nextValue()
    },

    integer(maxExclusive: number): number {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError('maxExclusive must be a positive safe integer')
      }

      return Math.floor(nextValue() * maxExclusive)
    },

    boolean(probability = 0.5): boolean {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new RangeError('probability must be between 0 and 1')
      }

      return nextValue() < probability
    },

    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new RangeError('Cannot pick from an empty collection')
      }

      return values[Math.floor(nextValue() * values.length)] as T
    },

    shuffle<T>(values: readonly T[]): T[] {
      const result = [...values]

      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(nextValue() * (index + 1))
        const current = result[index] as T
        result[index] = result[swapIndex] as T
        result[swapIndex] = current
      }

      return result
    },
  }
}

/** Stable unsigned 32-bit hash, useful for compact puzzle identifiers. */
export function hashSeed(seed: string): number {
  return xmur3(String(seed))()
}
