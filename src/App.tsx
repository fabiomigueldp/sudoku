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
  generatePuzzleInWorker,
} from './engine'
import {
  createGameState,
  exportGameSnapshot,
  gameActions,
  importGameSnapshot,
  loadActiveSession,
  loadSettings,
  loadStats,
  reduceGame,
  parseImportedPuzzle,
  saveActiveSession,
  saveGameCompletion,
  saveSettings,
  snapshotGame,
} from './game'
import { usePwaInstall } from './pwa/usePwaInstall'
import { Game } from './ui/Game'
import { Home } from './ui/Home'
import { Library } from './ui/Library'
import { Settings } from './ui/Settings'
import { Stats } from './ui/Stats'

type Screen = 'home' | 'library' | 'game' | 'settings' | 'stats'
type UpdateApp = (reloadPage?: boolean) => Promise<void>

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
  return `absolute-sudoku:free:v1:${variant}:${difficulty}:${entropy}`
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
  const [game, setGame] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [updateApp, setUpdateApp] = useState<UpdateApp | null>(null)

  const settingsRef = useRef(settings)
  const gameRef = useRef(game)
  const hydratedRef = useRef(false)
  const generationRef = useRef<AbortController | null>(null)
  const recordedCompletionRef = useRef<string | null>(null)
  const settingsReturnRef = useRef<'home' | 'game'>('home')
  const resumeAfterSettingsRef = useRef(false)

  settingsRef.current = settings
  gameRef.current = game

  const dispatch = useCallback((action: Parameters<typeof reduceGame>[1]) => {
    setGame((current) =>
      current === null
        ? null
        : reduceGame(current, action, {
            autoRemoveCandidates:
              settingsRef.current.autoRemoveCandidates,
            errorPolicy: settingsRef.current.errorPolicy,
          }),
    )
    if (
      action.type === 'input/digit' ||
      action.type === 'input/color' ||
      action.type === 'input/erase' ||
      action.type === 'history/undo' ||
      action.type === 'history/redo'
    ) {
      setChecking(false)
    }
  }, [])

  const generateAndStart = useCallback(
    async (
      variant: VariantId,
      difficulty: DifficultyId,
      seed: string,
    ) => {
      generationRef.current?.abort()
      const controller = new AbortController()
      generationRef.current = controller
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
        const nextGame = createGameState(puzzle, {
          now: Date.now(),
          selectFirstEmpty: true,
        })
        recordedCompletionRef.current = null
        setGame(nextGame)
        setChecking(false)
        setMenuOpen(false)
        setScreen('game')
        void saveActiveSession(nextGame)
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
    [],
  )

  const startDaily = useCallback(() => {
    const { variant, difficulty } = dailyProfile()
    void generateAndStart(
      variant,
      difficulty,
      dailySeed(new Date(), variant, difficulty),
    )
  }, [generateAndStart])

  useEffect(() => {
    void Promise.all([
      loadActiveSession({ now: Date.now() }),
      loadSettings(),
      loadStats(),
    ]).then(([session, storedSettings, storedStats]) => {
      setSettings(storedSettings)
      setStats(storedStats)
      setGame(session?.state ?? null)
      hydratedRef.current = true
      setLoading(false)

      const parameters = new URLSearchParams(window.location.search)
      const intent = parameters.get('intent')
      window.history.replaceState({}, '', window.location.pathname)

      if (intent === 'daily') {
        const { variant, difficulty } = dailyProfile()
        void generateAndStart(
          variant,
          difficulty,
          dailySeed(new Date(), variant, difficulty),
        )
      } else if (intent === 'resume' && session !== null) {
        setScreen('game')
      }
    })

    return () => generationRef.current?.abort()
  }, [generateAndStart])

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
    if (game === null || !hydratedRef.current) return
    void saveActiveSession(game)
  }, [game])

  useEffect(() => {
    if (game?.status !== 'completed') return
    const completionKey = `${game.puzzle.id}:${game.completedAt ?? 0}`
    if (recordedCompletionRef.current === completionKey) return
    recordedCompletionRef.current = completionKey

    void saveGameCompletion(game).then((result) => setStats(result.stats))
  }, [game])

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
      } else if (resumeWhenVisible) {
        resumeWhenVisible = false
        dispatch(gameActions.resume(Date.now()))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility)
  }, [dispatch])

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
    if (game?.status === 'playing') dispatch(gameActions.pause(Date.now()))
    setMenuOpen(false)
    setScreen('home')
  }

  const continueGame = () => {
    if (game === null) {
      setScreen('library')
      return
    }
    if (game.status === 'paused') dispatch(gameActions.resume(Date.now()))
    setScreen('game')
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
    if (range && game !== null && game.anchor >= 0) {
      const startRow = Math.floor(game.anchor / 9)
      const startColumn = game.anchor % 9
      const endRow = Math.floor(index / 9)
      const endColumn = index % 9
      const minRow = Math.min(startRow, endRow)
      const maxRow = Math.max(startRow, endRow)
      const minColumn = Math.min(startColumn, endColumn)
      const maxColumn = Math.max(startColumn, endColumn)

      setGame((current) => {
        if (current === null) return null
        let next = reduceGame(
          current,
          gameActions.select(game.anchor, 'replace'),
        )
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) {
            const cell = row * 9 + column
            if (cell === game.anchor) continue
            next = reduceGame(next, gameActions.select(cell, 'add'))
          }
        }
        return next
      })
      return
    }

    dispatch(
      gameActions.select(index, additive ? 'toggle' : 'replace', Date.now()),
    )
  }

  const moveSelection = (
    direction: 'up' | 'down' | 'left' | 'right' | 'home' | 'end',
    extend: boolean,
  ) => {
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
    window.requestAnimationFrame(() => {
      const activeCell = document.querySelector<HTMLElement>(
        '.sudoku-cell[tabindex="0"]',
      )
      activeCell?.focus({ preventScroll: true })
    })
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
    setGame((current) => {
      if (current?.hint === null || current === null) return current
      if (current.hint.phase === 4) {
        return reduceGame(
          current,
          gameActions.applyHint(Date.now()),
          {
            autoRemoveCandidates:
              settingsRef.current.autoRemoveCandidates,
            errorPolicy: settingsRef.current.errorPolicy,
          },
        )
      }
      const nextHint = findHint(
        current.cells,
        current.puzzle,
        (current.hint.phase + 1) as 2 | 3 | 4,
      )
      return nextHint === null ? current : { ...current, hint: nextHint }
    })
  }

  const restart = () => {
    setGame((current) => {
      if (current === null) return null
      const fresh = createGameState(current.puzzle, {
        now: Date.now(),
        selectFirstEmpty: true,
      })
      return {
        ...fresh,
        history: [...current.history, snapshotGame(current)],
      }
    })
    setMenuOpen(false)
    setChecking(false)
  }

  const importValue = (
    value: string,
    variant: VariantId,
    difficulty: DifficultyId,
  ) => {
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
        recordedCompletionRef.current = null
        setGame(resumed)
        setScreen('game')
        setGenerationError(null)
        void saveActiveSession(resumed)
        return null
      } catch (error) {
        return error instanceof Error
          ? error.message
          : 'O estado compartilhado está corrompido.'
      }
    }

    try {
      const puzzle = parseImportedPuzzle(normalized, variant, difficulty)
      const importedGame = createGameState(puzzle, {
        now: Date.now(),
        selectFirstEmpty: true,
      })
      recordedCompletionRef.current = null
      setGame(importedGame)
      setScreen('game')
      setGenerationError(null)
      void saveActiveSession(importedGame)
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

  if (loading) return <LoadingScreen />

  return (
    <div
      className="app"
      data-screen={screen}
      data-reduce-motion={settings.reduceMotion}
      data-high-contrast={settings.highContrast}
    >
      {screen === 'home' && (
        <Home
          session={game}
          install={pwaInstall}
          updateReady={updateApp !== null}
          onUpdate={() => void updateApp?.(true)}
          onContinue={continueGame}
          onDaily={startDaily}
          onNew={() => setScreen('library')}
          onStats={() => setScreen('stats')}
          onSettings={() => openSettings('home')}
        />
      )}

      {screen === 'library' && (
        <>
          <Library
            generating={generating}
            error={generationError}
            onBack={() => setScreen('home')}
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

      {screen === 'stats' && (
        <Stats stats={stats} onBack={() => setScreen('home')} />
      )}

      {screen === 'settings' && (
        <Settings
          settings={settings}
          onChange={setSettings}
          onBack={closeSettings}
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
          onDragSelect={(index) =>
            dispatch(gameActions.select(index, 'add', Date.now()))
          }
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
          onHintNext={advanceHint}
          onHintClose={() => dispatch(gameActions.dismissHint(Date.now()))}
          onCheck={() => {
            setChecking(true)
            setMenuOpen(false)
          }}
          onRestart={restart}
          onSettings={() => openSettings('game')}
          onCopy={copyCurrentState}
          copied={copied}
          onNew={() => setScreen('library')}
          onHome={goHome}
        />
      )}
    </div>
  )
}
