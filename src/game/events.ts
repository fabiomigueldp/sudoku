import type { GameState, PuzzleDefinition } from '../domain/types'
import {
  createGameState,
  type CreateGameOptions,
} from './state'
import {
  reduceGame,
  type GameAction,
  type GameReducerOptions,
} from './reducer'

export const EVENT_LOG_VERSION = 1

export interface GameEvent {
  sequence: number
  at: number
  action: GameAction
}

export interface GameEventLog {
  version: typeof EVENT_LOG_VERSION
  puzzle: PuzzleDefinition
  startedAt: number
  initial: {
    startPaused: boolean
    selectFirstEmpty: boolean
  }
  events: GameEvent[]
}

export interface ReducedGameEvent {
  state: GameState
  log: GameEventLog
  event: GameEvent
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function createEventLog(
  puzzle: PuzzleDefinition,
  startedAt = Date.now(),
  options: Omit<CreateGameOptions, 'now'> = {},
): GameEventLog {
  return {
    version: EVENT_LOG_VERSION,
    puzzle: cloneJson(puzzle),
    startedAt,
    initial: {
      startPaused: options.startPaused ?? false,
      selectFirstEmpty: options.selectFirstEmpty ?? true,
    },
    events: [],
  }
}

export function appendGameEvent(
  log: GameEventLog,
  action: GameAction,
  at: number,
): { log: GameEventLog; event: GameEvent } {
  if (!Number.isFinite(at) || at < 0) {
    throw new RangeError('Event timestamps must be finite positive values.')
  }

  const previousSequence = log.events.at(-1)?.sequence ?? 0
  const event: GameEvent = {
    sequence: previousSequence + 1,
    at,
    action: cloneJson(action),
  }

  return {
    event,
    log: {
      ...log,
      events: [...log.events, event],
    },
  }
}

export function applyGameEvent(
  state: GameState,
  event: GameEvent,
  options: Partial<GameReducerOptions> = {},
): GameState {
  const action = { ...cloneJson(event.action), at: event.at } as GameAction
  return reduceGame(state, action, options)
}

export function reduceAndRecord(
  state: GameState,
  log: GameEventLog,
  action: GameAction,
  at: number,
  options: Partial<GameReducerOptions> = {},
): ReducedGameEvent {
  const appended = appendGameEvent(log, action, at)
  return {
    state: applyGameEvent(state, appended.event, options),
    log: appended.log,
    event: appended.event,
  }
}

export function replayEventLog(
  log: GameEventLog,
  options: Partial<GameReducerOptions> = {},
): GameState {
  let state = createGameState(log.puzzle, {
    now: log.startedAt,
    startPaused: log.initial.startPaused,
    selectFirstEmpty: log.initial.selectFirstEmpty,
  })

  let expectedSequence = 1
  for (const event of log.events) {
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Invalid event sequence: expected ${expectedSequence}, received ${event.sequence}.`,
      )
    }
    state = applyGameEvent(state, event, options)
    expectedSequence += 1
  }

  return state
}
