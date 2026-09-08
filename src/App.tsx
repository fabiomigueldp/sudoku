import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { DEFAULT_SETTINGS, EMPTY_STATS } from './domain/catalog'
import type {
  CellColor,
  DifficultyId,
  Digit,
  GameSettings,
  GameState,
  InputMode,
  PlayerStats,
  VariantId,
} from './domain/types'
import {
  dailySeed,
  findHint,
  GENERATOR_VERSION,
  generatePracticePuzzleInWorker,
  generatePuzzleInWorker,
  practiceTechniqueDefinition,
  type LogicalTechnique,
} from './engine'
import {
  appendGameEvent,
  checkpointActiveSession,
  clearAllStoredData,
  createEventLog,
  createGameState,
  createSessionId,
  deleteSavedSession,
  EMPTY_PRACTICE_PROGRESS,
  exportDataBackup,
  exportGameSnapshot,
  gameActions,
  importGameSnapshot,
  listArchivedGameSummaries,
  listSavedGameSummaries,
  loadActiveSession,
  loadArchivedGame,
  loadPracticeProgress,
  loadSavedSession,
  loadSettings,
  loadStats,
  parseDataBackup,
  practiceTechniqueFromPuzzle,
  reduceGame,
  parseImportedPuzzle,
  replaySettingsFromGameSettings,
  restoreDataBackup,
  saveActiveSession,
  savedGameSummary,
  saveGameCompletion,
  saveSettings,
  type ArchivedGameSummary,
  type BackupRestoreResult,
  type BackupSummary,
  type GameAction,
  type GameEventLog,
  type PracticeProgress,
  type ReplaySettings,
  type SavedGameSummary,
} from './game'
import { usePwaInstall } from './pwa/usePwaInstall'
import { Analysis } from './ui/Analysis'
import { Game } from './ui/Game'
import { Home } from './ui/Home'
import { Library } from './ui/Library'
import { Practice } from './ui/Practice'
import { Settings } from './ui/Settings'
import { SavedGames } from './ui/SavedGames'
import { Stats } from './ui/Stats'

type Screen =
  | 'home'
  | 'library'
  | 'practice'
  | 'game'
  | 'settings'
  | 'stats'
  | 'analysis'
  | 'saved'
type UpdateApp = (reloadPage?: boolean) => Promise<void>

interface AnalysisSource {
  game: GameState
  eventLog: GameEventLog | null
  replaySettings: ReplaySettings
  returnTo: 'game' | 'stats'
}

let audioContext: AudioContext | null = null
const LIGHT_CHROME_COLOR = '#f6f3ed'
const DARK_CHROME_COLOR = '#0e1319'

function subtleSound(enabled: boolean) {
  if (!enabled || typeof AudioContext === 'undefined') return
  try {
    audioContext ??= new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 440
    gain.gain.setValueAtTime(0.018, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.045,
    )
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.05)
  } catch {
    // Feedback is an enhancement; input must never depend on it.
  }
}

function tactileFeedback(settings: GameSettings) {
  if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(7)
  subtleSound(settings.sound)
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // A DOM fallback remains available in browsers with restricted clipboard.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  } catch {
    return false
  }
}

function randomSeed(variant: VariantId, difficulty: DifficultyId) {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `absolute-sudoku:free:v2:g${GENERATOR_VERSION}:${variant}:${difficulty}:${entropy}`
}

const DAILY_SCHEDULE: ReadonlyArray<{
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

function dailyProfile(date = new Date()) {
  const ordinal = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  )
  return DAILY_SCHEDULE[ordinal % DAILY_SCHEDULE.length]!
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="Abrindo o Absolute Sudoku">
      <span className="loading-grid" aria-hidden="true" />
      <p>Preparando seu tabuleiro</p>
    </main>
  )
}

export function App() {
  const pwaInstall = usePwaInstall()
  const [screen, setScreen] = useState<Screen>('home')
  const [settings, setSettings] =
    useState<GameSettings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState<PlayerStats>(EMPTY_STATS)
  const [archives, setArchives] = useState<ArchivedGameSummary[]>([])
  const [practiceProgress, setPracticeProgress] =
    useState<PracticeProgress>(EMPTY_PRACTICE_PROGRESS)
  const [game, setGame] = useState<GameState | null>(null)
  const [savedGames, setSavedGames] = useState<SavedGameSummary[]>([])
  const [saveWarning, setSaveWarning] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [openingSession, setOpeningSession] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [practiceGenerating, setPracticeGenerating] =
    useState<LogicalTechnique | null>(null)
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const [analysisSource, setAnalysisSource] =
    useState<AnalysisSource | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [updateApp, setUpdateApp] = useState<UpdateApp | null>(null)
  const [sessionRevision, setSessionRevision] = useState(0)

  const settingsRef = useRef(settings)
  const gameRef = useRef(game)
  const eventLogRef = useRef<GameEventLog | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const switchingRef = useRef(false)
  const dailyStartingRef = useRef(false)
  const hydratedRef = useRef(false)
  const generationRef = useRef<AbortController | null>(null)
  const recordedCompletionRef = useRef<string | null>(null)
  const settingsReturnRef = useRef<'home' | 'game'>('home')
  const savedReturnRef = useRef<'home' | 'game'>('home')
  const libraryReturnRef = useRef<'home' | 'saved'>('home')
  const resumeAfterSettingsRef = useRef(false)
  const rangeOriginRef = useRef<{
    origin: number
    end: number
    puzzleId: string
  } | null>(null)

  settingsRef.current = settings
  gameRef.current = game

  const dispatchMany = useCallback((actions: readonly GameAction[]) => {
    let current = gameRef.current
    if (current === null) return

    let log = eventLogRef.current
    let changed = false
    let persistentChange = false
    let clearsChecking = false

    for (const action of actions) {
      const effectiveAction: GameAction =
        action.type === 'input/digit' &&
        action.autoRemoveCandidates === undefined
          ? {
              ...action,
              autoRemoveCandidates:
                settingsRef.current.autoRemoveCandidates,
            }
          : action
      const next = reduceGame(current, effectiveAction, {
        autoRemoveCandidates: settingsRef.current.autoRemoveCandidates,
        errorPolicy: settingsRef.current.errorPolicy,
      })
      if (next === current) continue

      changed = true
      current = next
      if (effectiveAction.type !== 'clock/tick') {
        persistentChange = true
        if (log !== null) {
          const at =
            typeof effectiveAction.at === 'number' &&
            Number.isFinite(effectiveAction.at)
              ? effectiveAction.at
              : Date.now()
          log = appendGameEvent(log, effectiveAction, at).log
        }
      }
      if (
        effectiveAction.type === 'input/digit' ||
        effectiveAction.type === 'input/color' ||
        effectiveAction.type === 'input/erase' ||
        effectiveAction.type === 'history/undo' ||
        effectiveAction.type === 'history/redo'
      ) {
        clearsChecking = true
      }
    }

    if (!changed) return
    gameRef.current = current
    eventLogRef.current = log
    setGame(current)
    if (persistentChange) setSessionRevision((revision) => revision + 1)
    if (clearsChecking) setChecking(false)
  }, [])

  const dispatch = useCallback(
    (action: GameAction) => dispatchMany([action]),
    [dispatchMany],
  )

  const persistCurrentSession = useCallback(() => {
    const current = gameRef.current
    const id = sessionIdRef.current
    if (current === null || id === null || !hydratedRef.current) return null
    const savedAt = Date.now()
    const summary = savedGameSummary(id, current, savedAt)
    setSavedGames((previous) => {
      const remaining = previous.filter((entry) => entry.id !== id)
      return current.status === 'completed' ? remaining : [summary, ...remaining]
    })
    return saveActiveSession(current, eventLogRef.current, savedAt, id).then((result) => {
      setSaveWarning(result.durable === false)
      return result
    })
  }, [])

  const checkpointCurrentSession = useCallback(() => {
    const current = gameRef.current
    if (current === null || !hydratedRef.current) return
    if (sessionIdRef.current === null) return
    checkpointActiveSession(current, eventLogRef.current, Date.now(), sessionIdRef.current)
    void persistCurrentSession()
  }, [persistCurrentSession])

  const suspendCurrentSession = useCallback(() => {
    if (gameRef.current?.status === 'playing') dispatch(gameActions.pause(Date.now()))
    const current = gameRef.current
    if (current && sessionIdRef.current) {
      checkpointActiveSession(current, eventLogRef.current, Date.now(), sessionIdRef.current)
    }
    return persistCurrentSession()
  }, [dispatch, persistCurrentSession])

  const adoptSession = useCallback((state: GameState, log: GameEventLog | null, id: string) => {
    rangeOriginRef.current = null
    recordedCompletionRef.current = null
    sessionIdRef.current = id
    gameRef.current = state
    eventLogRef.current = log
    setGame(state)
    if (state.status === 'paused') dispatch(gameActions.resume(Date.now()))
    setChecking(false)
    setMenuOpen(false)
    setCopied(false)
    setSessionError(null)
    setScreen('game')
    checkpointCurrentSession()
  }, [checkpointCurrentSession, dispatch])

  const resumeSavedGame = useCallback(async (id: string) => {
    if (switchingRef.current) return
    switchingRef.current = true
    setOpeningSession(id)
    setSessionError(null)
    try {
      await suspendCurrentSession()
      const session = await loadSavedSession(id, { now: Date.now() })
      if (session === null) {
        setSessionError('Não foi possível abrir esta partida. Tente novamente.')
        return
      }
      adoptSession(session.state, session.eventLog, session.id)
    } catch {
      setSessionError('Não foi possível abrir esta partida. Tente novamente.')
    } finally {
      switchingRef.current = false
      setOpeningSession(null)
    }
  }, [adoptSession, suspendCurrentSession])

  const generateAndStart = useCallback(
    async (
      variant: VariantId,
      difficulty: DifficultyId,
      seed: string,
    ) => {
      generationRef.current?.abort()
      const controller = new AbortController()
      generationRef.current = controller
      setPracticeGenerating(null)
      setPracticeError(null)
      setGenerating(true)
      setGenerationError(null)

      try {
        const puzzle = await generatePuzzleInWorker(
          seed,
          variant,
          difficulty,
          {
            generatedAt: Date.now(),
            signal: controller.signal,
          },
        )
        if (controller.signal.aborted) return
        const startedAt = Date.now()
        const nextGame = createGameState(puzzle, {
          now: startedAt,
          selectFirstEmpty: true,
        })
        const nextLog = createEventLog(puzzle, startedAt, {
          selectFirstEmpty: true,
        })
        await suspendCurrentSession()
        if (controller.signal.aborted) return
        adoptSession({ ...nextGame, lastResumedAt: Date.now() }, nextLog, createSessionId())
        if ('storage' in navigator && 'persist' in navigator.storage) {
          void navigator.storage.persist().catch(() => false)
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return
        }
        setGenerationError(
          'Não foi possível construir esta grade. Tente outra seed ou intensidade.',
        )
        setScreen('library')
      } finally {
        if (generationRef.current === controller) {
          generationRef.current = null
          setGenerating(false)
        }
      }
    },
    [adoptSession, suspendCurrentSession],
  )

  const startDaily = useCallback(async () => {
    if (generationRef.current || switchingRef.current || dailyStartingRef.current) return
    dailyStartingRef.current = true
    try {
      const { variant, difficulty } = dailyProfile()
      const seed = dailySeed(new Date(), variant, difficulty)
      const saved = (await listSavedGameSummaries()).find((entry) => entry.seed === seed)
      if (saved) await resumeSavedGame(saved.id)
      else await generateAndStart(variant, difficulty, seed)
    } finally {
      dailyStartingRef.current = false
    }
  }, [generateAndStart, resumeSavedGame])

  const startPractice = useCallback(async (technique: LogicalTechnique) => {
    generationRef.current?.abort()
    const controller = new AbortController()
    generationRef.current = controller
    setGenerating(false)
    setGenerationError(null)
    setPracticeGenerating(technique)
    setPracticeError(null)

    const entropy =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const puzzle = await generatePracticePuzzleInWorker(
        technique,
        entropy,
        { generatedAt: Date.now(), signal: controller.signal },
      )
      if (controller.signal.aborted) return
      const startedAt = Date.now()
      const nextGame = createGameState(puzzle, {
        now: startedAt,
        selectFirstEmpty: true,
      })
      const nextLog = createEventLog(puzzle, startedAt, {
        selectFirstEmpty: true,
      })
      await suspendCurrentSession()
      if (controller.signal.aborted) return
      adoptSession({ ...nextGame, lastResumedAt: Date.now() }, nextLog, createSessionId())
      if ('storage' in navigator && 'persist' in navigator.storage) {
        void navigator.storage.persist().catch(() => false)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPracticeError(
        'Não foi possível construir esta prática agora. Tente novamente.',
      )
      setScreen('practice')
    } finally {
      if (generationRef.current === controller) {
        generationRef.current = null
        setPracticeGenerating(null)
      }
    }
  }, [adoptSession, suspendCurrentSession])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      loadActiveSession({ now: Date.now() }),
      loadSettings(),
      loadStats(),
      listArchivedGameSummaries(),
      loadPracticeProgress(),
      listSavedGameSummaries(),
    ]).then(async ([
      session,
      storedSettings,
      storedStats,
      storedArchives,
      storedPractice,
      storedSavedGames,
    ]) => {
      if (cancelled) return
      // A close immediately after the final digit can leave only the completed
      // checkpoint. Archive it before choosing another unfinished game.
      if (session?.state.status === 'completed') {
        const legacyRecordId = `${session.state.puzzle.id}:${session.state.completedAt}`
        const existingRecord = [...storedStats.records, ...storedPractice.records].find(
          (record) => record.id === session.id || record.id === legacyRecordId,
        )
        const recovered = await saveGameCompletion(session.state, {
          sessionId: session.id,
          recordId: existingRecord?.id ?? session.id,
          eventLog: session.eventLog,
          replaySettings: replaySettingsFromGameSettings(storedSettings),
        })
        storedStats = recovered.stats
        ;[storedArchives, storedPractice] = await Promise.all([
          listArchivedGameSummaries(), loadPracticeProgress(),
        ])
      }
      if (cancelled) return
      const recent = session?.state.status !== 'completed' && session !== null
        ? session
        : storedSavedGames[0]
          ? await loadSavedSession(storedSavedGames[0].id)
          : session
      if (cancelled) return
      setSettings(storedSettings)
      setStats(storedStats)
      setArchives(storedArchives)
      setPracticeProgress(storedPractice)
      sessionIdRef.current = recent?.id ?? null
      gameRef.current = recent?.state ?? null
      eventLogRef.current = recent?.eventLog ?? null
      setGame(recent?.state ?? null)
      setSavedGames(storedSavedGames)
      hydratedRef.current = true
      setLoading(false)

      const parameters = new URLSearchParams(window.location.search)
      const intent = parameters.get('intent')
      window.history.replaceState({}, '', window.location.pathname)

      if (intent === 'daily') {
        void suspendCurrentSession()
        void startDaily()
      } else if (intent === 'resume' && recent !== null) {
        adoptSession(recent.state, recent.eventLog, recent.id)
      } else if (recent?.state.status === 'playing') {
        // Browsing the home screen is not time spent solving the puzzle.
        dispatch(gameActions.pause(recent.state.lastResumedAt ?? Date.now()))
      }
    })

    return () => {
      cancelled = true
      generationRef.current?.abort()
    }
  }, [adoptSession, dispatch, startDaily, suspendCurrentSession])

  useEffect(() => {
    const root = document.documentElement
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      if (settings.theme === 'system') delete root.dataset.theme
      else root.dataset.theme = settings.theme

      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && systemTheme.matches)
      const chromeColor = dark ? DARK_CHROME_COLOR : LIGHT_CHROME_COLOR
      root.style.colorScheme = dark ? 'dark' : 'light'
      root.style.backgroundColor = chromeColor
      document.body.style.backgroundColor = chromeColor
      document
        .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.setAttribute('content', chromeColor)
      document
        .querySelector<HTMLMetaElement>(
          'meta[name="apple-mobile-web-app-status-bar-style"]',
        )
        ?.setAttribute('content', dark ? 'black-translucent' : 'default')
    }

    applyTheme()
    systemTheme.addEventListener('change', applyTheme)
    if (hydratedRef.current) void saveSettings(settings)
    return () => systemTheme.removeEventListener('change', applyTheme)
  }, [settings])

  useEffect(() => {
    if (sessionRevision === 0 || !hydratedRef.current) return
    const timer = window.setTimeout(persistCurrentSession, 180)
    return () => window.clearTimeout(timer)
  }, [persistCurrentSession, sessionRevision])

  useEffect(() => {
    if (game?.status !== 'completed') return
    const completionKey = `${game.puzzle.id}:${game.completedAt ?? 0}`
    if (recordedCompletionRef.current === completionKey) return
    recordedCompletionRef.current = completionKey

    void saveGameCompletion(game, {
      ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
      recordId: [...stats.records, ...practiceProgress.records].find(
        (record) => record.id === sessionIdRef.current || record.id === completionKey,
      )?.id ?? sessionIdRef.current ?? completionKey,
      eventLog: eventLogRef.current,
      replaySettings: replaySettingsFromGameSettings(settingsRef.current),
    }).then(async (result) => {
      const [storedArchives, storedPractice] = await Promise.all([
        listArchivedGameSummaries(),
        loadPracticeProgress(),
      ])
      setStats(result.stats)
      setArchives(storedArchives)
      setPracticeProgress(storedPractice)
    })
  }, [game, stats.records, practiceProgress.records])

  useEffect(() => {
    if (screen !== 'game' || game?.status !== 'playing') return
    const tick = () => dispatch(gameActions.tick(Date.now()))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [dispatch, game?.status, screen])

  useEffect(() => {
    let resumeWhenVisible = false
    const handleVisibility = () => {
      const current = gameRef.current
      if (document.visibilityState === 'hidden') {
        resumeWhenVisible = current?.status === 'playing'
        if (resumeWhenVisible) dispatch(gameActions.pause(Date.now()))
        checkpointCurrentSession()
      } else if (resumeWhenVisible) {
        resumeWhenVisible = false
        dispatch(gameActions.resume(Date.now()))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [dispatch, checkpointCurrentSession])

  useEffect(() => {
    const handlePageHide = () => checkpointCurrentSession()
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [checkpointCurrentSession])

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const custom = event as CustomEvent<UpdateApp>
      if (typeof custom.detail === 'function') setUpdateApp(() => custom.detail)
    }
    window.addEventListener('absolute-sudoku:update-ready', handleUpdate)
    return () =>
      window.removeEventListener('absolute-sudoku:update-ready', handleUpdate)
  }, [])

  const goHome = () => {
    rangeOriginRef.current = null
    void suspendCurrentSession()
    setMenuOpen(false)
    setScreen('home')
  }

  const continueGame = () => {
    const recent = savedGames.find((entry) => entry.id === sessionIdRef.current) ?? savedGames[0]
    if (!recent) {
      setScreen('library')
      return
    }
    void resumeSavedGame(recent.id)
  }

  const openSavedGames = (from: 'home' | 'game') => {
    savedReturnRef.current = from
    void suspendCurrentSession()
    setMenuOpen(false)
    setSessionError(null)
    setScreen('saved')
  }

  const removeSavedGame = async (id: string) => {
    const wasCurrent = sessionIdRef.current === id
    // Pending autosaves/pagehide must not recreate an attempt being deleted.
    if (wasCurrent) sessionIdRef.current = null
    try {
      await deleteSavedSession(id)
    } catch (error) {
      if (wasCurrent) sessionIdRef.current = id
      throw error
    }
    if (wasCurrent) {
      gameRef.current = null
      eventLogRef.current = null
      sessionIdRef.current = null
      setGame(null)
      savedReturnRef.current = 'home'
    }
    setSavedGames((previous) => previous.filter((entry) => entry.id !== id))
  }

  const openLibrary = (from: 'home' | 'saved') => {
    libraryReturnRef.current = from
    setGenerationError(null)
    setScreen('library')
  }

  const openSettings = (from: 'home' | 'game') => {
    settingsReturnRef.current = from
    resumeAfterSettingsRef.current =
      from === 'game' && game?.status === 'playing'
    if (resumeAfterSettingsRef.current) {
      dispatch(gameActions.pause(Date.now()))
    }
    setMenuOpen(false)
    setScreen('settings')
  }

  const closeSettings = () => {
    if (settingsReturnRef.current === 'game' && game !== null) {
      if (resumeAfterSettingsRef.current) {
        dispatch(gameActions.resume(Date.now()))
      }
      setScreen('game')
    } else {
      setScreen('home')
    }
    resumeAfterSettingsRef.current = false
  }

  const selectCell = (
    index: number,
    additive: boolean,
    range: boolean,
  ) => {
    const current = gameRef.current
    if (current?.status !== 'playing') return
    if (range && current.anchor >= 0) {
      const previousRange = rangeOriginRef.current
      const origin = previousRange?.end === current.anchor &&
        previousRange.puzzleId === current.puzzle.id
        ? previousRange.origin
        : current.anchor
      rangeOriginRef.current = { origin, end: index, puzzleId: current.puzzle.id }
      const startRow = Math.floor(origin / 9)
      const startColumn = origin % 9
      const endRow = Math.floor(index / 9)
      const endColumn = index % 9
      const minRow = Math.min(startRow, endRow)
      const maxRow = Math.max(startRow, endRow)
      const minColumn = Math.min(startColumn, endColumn)
      const maxColumn = Math.max(startColumn, endColumn)

      const at = Date.now()
      const actions: GameAction[] = [
        gameActions.select(origin, 'replace', at),
      ]
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const cell = row * 9 + column
          if (cell === origin || cell === index) continue
          actions.push(gameActions.select(cell, 'add', at))
        }
      }
      if (index !== origin) actions.push(gameActions.select(index, 'add', at))
      dispatchMany(actions)
      return
    }

    rangeOriginRef.current = null
    dispatch(
      gameActions.select(index, additive ? 'toggle' : 'replace', Date.now()),
    )
  }

  const moveSelection = (
    direction: 'up' | 'down' | 'left' | 'right' | 'home' | 'end',
    extend: boolean,
  ) => {
    if (gameRef.current?.status !== 'playing') return
    rangeOriginRef.current = null
    const anchor = Math.max(0, gameRef.current?.anchor ?? 0)
    const row = Math.floor(anchor / 9)
    const column = anchor % 9
    let target = anchor

    if (direction === 'up') target = Math.max(0, row - 1) * 9 + column
    if (direction === 'down') target = Math.min(8, row + 1) * 9 + column
    if (direction === 'left') target = row * 9 + Math.max(0, column - 1)
    if (direction === 'right') target = row * 9 + Math.min(8, column + 1)
    if (direction === 'home') target = row * 9
    if (direction === 'end') target = row * 9 + 8

    dispatch(gameActions.select(target, extend ? 'add' : 'replace', Date.now()))
  }

  const setDigit = (digit: Digit, mode?: InputMode) => {
    tactileFeedback(settingsRef.current)
    dispatch(gameActions.setDigit(digit, Date.now(), mode))
  }

  const showOrAdvanceHint = () => {
    const current = gameRef.current
    if (current === null) return
    if (current.hint !== null) {
      advanceHint()
      return
    }
    const hint = findHint(current.cells, current.puzzle, 1)
    if (hint !== null) {
      dispatch(gameActions.showHint(hint, Date.now()))
    }
  }

  const advanceHint = () => {
    const current = gameRef.current
    if (current?.hint === null || current === null) return
    if (current.hint.phase === 4) {
      rangeOriginRef.current = null
      dispatch(current.hint.digit === undefined
        ? gameActions.dismissHint(Date.now())
        : gameActions.applyHint(Date.now()))
      return
    }
    const nextHint = findHint(
      current.cells,
      current.puzzle,
      (current.hint.phase + 1) as 2 | 3 | 4,
    )
    if (nextHint !== null) {
      dispatch(gameActions.updateHint(nextHint, Date.now()))
    }
  }

  const restart = () => {
    rangeOriginRef.current = null
    dispatch(gameActions.restart(Date.now()))
    setMenuOpen(false)
    setChecking(false)
  }

  const importValue = async (
    value: string,
    variant: VariantId,
    difficulty: DifficultyId,
  ): Promise<string | null> => {
    const normalized = value.trim()
    if (!normalized) return 'Cole uma grade ou um estado compartilhado.'

    if (/^ASUD\d+\./i.test(normalized)) {
      try {
        const imported = importGameSnapshot(normalized)
        const resumed: GameState = {
          ...imported,
          lastResumedAt:
            imported.status === 'playing' ? Date.now() : imported.lastResumedAt,
        }
        await suspendCurrentSession()
        generationRef.current?.abort()
        adoptSession(resumed, null, createSessionId())
        setGenerationError(null)
        return null
      } catch (error) {
        return error instanceof Error
          ? error.message
          : 'O estado compartilhado está corrompido.'
      }
    }

    try {
      const puzzle = parseImportedPuzzle(normalized, variant, difficulty)
      const startedAt = Date.now()
      const importedGame = createGameState(puzzle, {
        now: startedAt,
        selectFirstEmpty: true,
      })
      const importedLog = createEventLog(puzzle, startedAt, {
        selectFirstEmpty: true,
      })
      await suspendCurrentSession()
      generationRef.current?.abort()
      adoptSession(importedGame, importedLog, createSessionId())
      setGenerationError(null)
      return null
    } catch (error) {
      return error instanceof Error
        ? error.message
        : 'Não foi possível validar esta grade.'
    }
  }

  const copyCurrentState = () => {
    const current = gameRef.current
    if (current === null) return
    void copyText(exportGameSnapshot(current)).then((success) => {
      setCopied(success)
    })
  }

  const exportAllData = async (): Promise<BackupSummary> => {
    await persistCurrentSession()
    const backup = await exportDataBackup()
    const blob = new Blob([backup.serialized], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `absolute-sudoku-${new Date(backup.summary.exportedAt)
      .toISOString()
      .slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    return backup.summary
  }

  const inspectBackup = (serialized: string): BackupSummary =>
    parseDataBackup(serialized).summary

  const restoreAllData = async (
    serialized: string,
  ): Promise<BackupRestoreResult> => {
    hydratedRef.current = false
    try {
      const result = await restoreDataBackup(serialized)
      const [session, storedSettings, storedStats, storedArchives, storedPractice, storedSavedGames] =
        await Promise.all([
          loadActiveSession({ now: Date.now() }),
          loadSettings(),
          loadStats(),
          listArchivedGameSummaries(),
          loadPracticeProgress(),
          listSavedGameSummaries(),
        ])
      settingsRef.current = storedSettings
      gameRef.current = session?.state ?? null
      eventLogRef.current = session?.eventLog ?? null
      sessionIdRef.current = session?.id ?? null
      recordedCompletionRef.current = null
      setSettings(storedSettings)
      setStats(storedStats)
      setArchives(storedArchives)
      setPracticeProgress(storedPractice)
      setSavedGames(storedSavedGames)
      setSaveWarning(result.storage.durable === false)
      if (gameRef.current?.status === 'playing') {
        dispatch(gameActions.pause(gameRef.current.lastResumedAt ?? Date.now()))
      }
      setGame(gameRef.current)
      setAnalysisSource(null)
      return result
    } finally {
      hydratedRef.current = true
    }
  }

  const clearAllData = async (): Promise<void> => {
    hydratedRef.current = false
    try {
      await clearAllStoredData()
      settingsRef.current = DEFAULT_SETTINGS
      gameRef.current = null
      eventLogRef.current = null
      sessionIdRef.current = null
      recordedCompletionRef.current = null
      setSettings(DEFAULT_SETTINGS)
      setStats(EMPTY_STATS)
      setArchives([])
      setPracticeProgress(EMPTY_PRACTICE_PROGRESS)
      setGame(null)
      setSavedGames([])
      setSaveWarning(false)
      setAnalysisSource(null)
      setScreen('home')
    } finally {
      hydratedRef.current = true
    }
  }

  const openCurrentAnalysis = () => {
    const current = gameRef.current
    if (current === null) return
    setAnalysisSource({
      game: current,
      eventLog: eventLogRef.current,
      replaySettings: replaySettingsFromGameSettings(settingsRef.current),
      returnTo: 'game',
    })
    setScreen('analysis')
  }

  const openArchivedAnalysis = (id: string) => {
    void loadArchivedGame(id).then((archived) => {
      if (archived === null) return
      setAnalysisSource({
        game: archived.state,
        eventLog: archived.eventLog,
        replaySettings: archived.replaySettings,
        returnTo: 'stats',
      })
      setScreen('analysis')
    })
  }

  if (loading) return <LoadingScreen />

  return (
    <div
      className="app"
      data-screen={screen}
      data-reduce-motion={settings.reduceMotion}
      data-high-contrast={settings.highContrast}
    >
      {saveWarning && (
        <p className="save-warning" role="alert">
          O navegador não conseguiu salvar suas alterações. Mantenha o app aberto e exporte um backup em Ajustes → Dados.
        </p>
      )}
      {screen === 'home' && (
        <Home
          session={savedGames.find((entry) => entry.id === sessionIdRef.current) ?? savedGames[0] ?? null}
          savedCount={savedGames.length}
          busy={generating || openingSession !== null}
          error={sessionError}
          onSaved={() => openSavedGames('home')}
          install={pwaInstall}
          updateReady={updateApp !== null}
          onUpdate={() => void updateApp?.(true)}
          onContinue={continueGame}
          onDaily={() => void startDaily()}
          onNew={() => openLibrary('home')}
          onStats={() => setScreen('stats')}
          onSettings={() => openSettings('home')}
        />
      )}

      {screen === 'library' && (
        <>
          <Library
            generating={generating}
            error={generationError}
            onBack={() => {
              generationRef.current?.abort()
              setScreen(libraryReturnRef.current)
            }}
            onPractice={() => {
              generationRef.current?.abort()
              setScreen('practice')
            }}
            onImport={importValue}
            onStart={(variant, difficulty) =>
              void generateAndStart(
                variant,
                difficulty,
                randomSeed(variant, difficulty),
              )
            }
          />
        </>
      )}

      {screen === 'saved' && (
        <SavedGames
          sessions={savedGames}
          openingId={openingSession}
          error={sessionError}
          onOpen={(id) => void resumeSavedGame(id)}
          onDelete={removeSavedGame}
          onNew={() => openLibrary('saved')}
          onBack={() => {
            if (savedReturnRef.current === 'game' && gameRef.current !== null) continueGame()
            else setScreen('home')
          }}
        />
      )}

      {screen === 'practice' && (
        <Practice
          progress={practiceProgress}
          generating={practiceGenerating}
          error={practiceError}
          onBack={() => {
            generationRef.current?.abort()
            setScreen('library')
          }}
          onStart={(technique) => void startPractice(technique)}
        />
      )}

      {screen === 'stats' && (
        <Stats
          stats={stats}
          archives={archives}
          onBack={() => setScreen('home')}
          onOpenArchive={openArchivedAnalysis}
        />
      )}

      {screen === 'settings' && (
        <Settings
          settings={settings}
          onChange={setSettings}
          onBack={closeSettings}
          onExportData={exportAllData}
          onInspectBackup={inspectBackup}
          onRestoreData={restoreAllData}
          onClearData={clearAllData}
        />
      )}

      {screen === 'analysis' && analysisSource !== null && (
          <Analysis
            key={analysisSource.game.puzzle.id}
            game={analysisSource.game}
            eventLog={analysisSource.eventLog}
            settings={settings}
            replaySettings={analysisSource.replaySettings}
            onBack={() => {
              setScreen(analysisSource.returnTo)
              setAnalysisSource(null)
            }}
          />
        )}

      {screen === 'game' && game !== null && (
        <Game
          game={game}
          settings={settings}
          menuOpen={menuOpen}
          checking={checking}
          onBack={goHome}
          onMenu={(open) => {
            setMenuOpen(open)
            if (!open) setCopied(false)
          }}
          onPause={() =>
            dispatch(
              game.status === 'paused'
                ? gameActions.resume(Date.now())
                : gameActions.pause(Date.now()),
            )
          }
          onSelect={selectCell}
          onDragSelect={(index) => {
            if (gameRef.current?.status !== 'playing') return
            rangeOriginRef.current = null
            dispatch(gameActions.select(index, 'add', Date.now()))
          }}
          onMoveSelection={moveSelection}
          onMode={(mode: InputMode) =>
            dispatch(gameActions.setMode(mode, Date.now()))
          }
          onDigit={setDigit}
          onColor={(color: CellColor) => {
            tactileFeedback(settingsRef.current)
            dispatch(gameActions.setColor(color, Date.now()))
          }}
          onErase={() => dispatch(gameActions.erase(Date.now()))}
          onUndo={() => dispatch(gameActions.undo(Date.now()))}
          onRedo={() => dispatch(gameActions.redo(Date.now()))}
          onHint={showOrAdvanceHint}
          onAutoFinish={() => dispatch({ type: 'game/auto-finish', at: Date.now() })}
          onHintNext={advanceHint}
          onHintClose={() => dispatch(gameActions.dismissHint(Date.now()))}
          onCheck={() => {
            setChecking(true)
            setMenuOpen(false)
          }}
          onRestart={restart}
          onSettings={() => openSettings('game')}
          onSaved={() => openSavedGames('game')}
          onCopy={copyCurrentState}
          copied={copied}
          onNew={() =>
            setScreen(
              practiceTechniqueFromPuzzle(game.puzzle) === null
                ? 'library'
                : 'practice',
            )
          }
          onHome={goHome}
          contextLabel={(() => {
            const technique = practiceTechniqueFromPuzzle(game.puzzle)
            return technique === null
              ? undefined
              : `Prática · ${practiceTechniqueDefinition(technique)?.name ?? technique}`
          })()}
          onAnalyze={openCurrentAnalysis}
        />
      )}
    </div>
  )
}
