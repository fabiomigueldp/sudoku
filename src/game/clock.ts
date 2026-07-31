import type { GameState } from '../domain/types'

function safeTimestamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function elapsedAt(
  state: Pick<GameState, 'elapsedMs' | 'lastResumedAt' | 'status'>,
  now: number,
): number {
  const elapsed = Math.max(0, state.elapsedMs)
  if (state.status !== 'playing' || state.lastResumedAt === null) {
    return elapsed
  }

  return elapsed + Math.max(0, safeTimestamp(now) - state.lastResumedAt)
}

export function advanceClock(state: GameState, now: number): GameState {
  if (state.status !== 'playing' || state.lastResumedAt === null) return state

  const safeNow = Math.max(state.lastResumedAt, safeTimestamp(now))
  return {
    ...state,
    elapsedMs: state.elapsedMs + (safeNow - state.lastResumedAt),
    lastResumedAt: safeNow,
  }
}

export function pauseAt(state: GameState, now: number): GameState {
  if (state.status !== 'playing') return state
  const advanced = advanceClock(state, now)
  return {
    ...advanced,
    status: 'paused',
    lastResumedAt: null,
  }
}

export function resumeAt(state: GameState, now: number): GameState {
  if (state.status !== 'paused') return state
  return {
    ...state,
    status: 'playing',
    lastResumedAt: safeTimestamp(now),
  }
}

export function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const pair = (value: number) => value.toString().padStart(2, '0')

  return hours > 0
    ? `${hours}:${pair(minutes)}:${pair(seconds)}`
    : `${pair(minutes)}:${pair(seconds)}`
}

export interface GameClock {
  read: () => number
  pause: () => void
  resume: () => void
  stop: () => void
}

export interface GameClockOptions {
  intervalMs?: number
  now?: () => number
  onTick: (now: number) => void
  onPause?: (now: number) => void
  onResume?: (now: number) => void
}

/**
 * Small framework-independent clock driver. Elapsed time is always calculated by
 * the reducer from timestamps; interval throttling therefore cannot lose time.
 */
export function createGameClock(options: GameClockOptions): GameClock {
  const now = options.now ?? Date.now
  const intervalMs = Math.max(250, options.intervalMs ?? 1_000)
  let timer: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (timer !== null) return
    timer = setInterval(() => options.onTick(now()), intervalMs)
  }

  const stop = () => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  start()

  return {
    read: now,
    pause: () => {
      const at = now()
      stop()
      options.onPause?.(at)
    },
    resume: () => {
      const at = now()
      options.onResume?.(at)
      start()
    },
    stop,
  }
}
