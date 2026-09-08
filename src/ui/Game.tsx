import { useCallback, useLayoutEffect, useMemo } from 'react'
import type {
  CellColor,
  Digit,
  GameSettings,
  GameState,
  InputMode,
} from '../domain/types'
import { candidatesFor, conflictingCells, peersFor } from '../engine'
import { Board } from './Board'
import { GameHeader } from './GameHeader'
import {
  CompletionOverlay,
  GameMenu,
  HintPanel,
  PauseOverlay,
} from './GameOverlays'
import { NumberPad } from './NumberPad'

interface GameProps {
  game: GameState
  settings: GameSettings
  menuOpen: boolean
  checking: boolean
  onBack: () => void
  onMenu: (open: boolean) => void
  onPause: () => void
  onSelect: (index: number, additive: boolean, range: boolean) => void
  onDragSelect: (index: number) => void
  onMoveSelection: (
    direction: 'up' | 'down' | 'left' | 'right' | 'home' | 'end',
    extend: boolean,
  ) => void
  onMode: (mode: InputMode) => void
  onDigit: (digit: Digit, mode?: InputMode) => void
  onColor: (color: CellColor) => void
  onErase: () => void
  onUndo: () => void
  onRedo: () => void
  onHint: () => void
  onHintNext: () => void
  onHintClose: () => void
  onCheck: () => void
  onRestart: () => void
  onSettings: () => void
  onSaved: () => void
  onCopy: () => void
  copied: boolean
  contextLabel?: string | undefined
  onNew: () => void
  onHome: () => void
  onAnalyze?: (() => void) | undefined
}

function boardValues(cells: GameState['cells']) {
  return cells.map((cell) => cell.value ?? 0)
}

export function Game({
  game,
  settings,
  menuOpen,
  checking,
  onBack,
  onMenu,
  onPause,
  onSelect,
  onDragSelect,
  onMoveSelection,
  onMode,
  onDigit,
  onColor,
  onErase,
  onUndo,
  onRedo,
  onHint,
  onHintNext,
  onHintClose,
  onCheck,
  onRestart,
  onSettings,
  onSaved,
  onCopy,
  copied,
  contextLabel,
  onNew,
  onHome,
  onAnalyze,
}: GameProps) {
  const values = useMemo(() => boardValues(game.cells), [game.cells])
  const peers = useMemo(
    () =>
      new Set(
        game.anchor >= 0
          ? peersFor(game.anchor, game.puzzle.variant)
          : [],
      ),
    [game.anchor, game.puzzle.variant],
  )
  const checkSolution = checking || settings.errorPolicy === 'solution' ||
    (settings.errorPolicy === 'completion' && values.every((value) => value !== 0))
  const checkConflicts = checkSolution || settings.errorPolicy === 'conflicts'
  const structuralConflicts = useMemo(
    () => new Set(
      checkConflicts
        ? conflictingCells(values, game.puzzle.variant)
        : [],
    ),
    [values, game.puzzle.variant, checkConflicts],
  )
  const solutionConflicts = useMemo(() => {
    if (!checkSolution) {
      return new Set<number>()
    }
    return new Set(
      values.flatMap((value, index) =>
        value !== 0 && value !== game.puzzle.solution[index] ? [index] : [],
      ),
    )
  }, [checkSolution, game.puzzle.solution, values])
  const conflicts = useMemo(
    () => new Set([...structuralConflicts, ...solutionConflicts]),
    [structuralConflicts, solutionConflicts],
  )
  const counts = useMemo(
    () =>
      Array.from(
        { length: 9 },
        (_, index) =>
          game.cells.filter((cell) => cell.value === index + 1).length,
      ),
    [game.cells],
  )
  const activeColor = useMemo(() => {
    const firstIndex = game.selected.at(0)
    if (firstIndex === undefined) return null
    const firstColor = game.cells[firstIndex]?.color ?? null
    return firstColor !== null &&
      game.selected.every((index) => game.cells[index]?.color === firstColor)
      ? firstColor
      : null
  }, [game.cells, game.selected])
  const displayedCells = useMemo(() => {
    if (!settings.autoCandidates) return game.cells
    return game.cells.map((cell, index) => {
      if (
        cell.value !== null ||
        cell.corner.length > 0 ||
        cell.center.length > 0
      ) {
        return cell
      }
      return {
        ...cell,
        corner: candidatesFor(values, index, game.puzzle.variant),
      }
    })
  }, [game.cells, game.puzzle.variant, settings.autoCandidates, values])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (menuOpen || game.status !== 'playing' || event.defaultPrevented ||
      event.isComposing || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement &&
      target.closest('input, textarea, select, [contenteditable="true"]')) return
    const directionByKey: Partial<
      Record<
        string,
        'up' | 'down' | 'left' | 'right' | 'home' | 'end'
      >
    > = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Home: 'home',
      End: 'end',
    }
    const direction = directionByKey[event.key]
    if (direction && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      onMoveSelection(direction, event.shiftKey)
      return
    }

    const digitKey = /^[1-9]$/.test(event.key)
      ? event.key
      : event.shiftKey && /^(Digit|Numpad)[1-9]$/.test(event.code)
        ? event.code.at(-1)
        : undefined
    if (digitKey !== undefined) {
      event.preventDefault()
      if (event.repeat) return
      const digit = Number(digitKey) as Digit
      const directMode = event.ctrlKey || event.metaKey
        ? 'center'
        : event.shiftKey
          ? 'corner'
          : undefined
      onDigit(digit, directMode)
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      onErase()
      return
    }

    if (event.key === ' ' && target instanceof HTMLElement &&
      target.closest('[role="gridcell"]')) {
      event.preventDefault()
      if (event.repeat) return
      const modes: InputMode[] = ['value', 'corner', 'center', 'color']
      const next = modes[(modes.indexOf(game.inputMode) + 1) % modes.length]
      if (next) onMode(next)
      return
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'z'
    ) {
      event.preventDefault()
      if (event.shiftKey) onRedo()
      else onUndo()
    }
  }, [
    game.inputMode, game.status, menuOpen, onDigit, onErase,
    onMode, onMoveSelection, onRedo, onUndo,
  ])

  useLayoutEffect(() => {
    // Safari can leave focus on the body after a tool click. Route shortcuts
    // for the mounted game, including this native focus state.
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <main className="game-screen">
      <GameHeader
        variant={game.puzzle.variant}
        difficulty={game.puzzle.difficulty}
        elapsedMs={game.elapsedMs}
        showTimer={settings.showTimer}
        status={game.status}
        contextLabel={contextLabel}
        onBack={onBack}
        onPause={onPause}
        onMore={() => onMenu(true)}
      />

      <div className="game-body">
        <div className="board-column">
          <Board
            cells={displayedCells}
            puzzle={game.puzzle}
            selected={game.selected}
            anchor={game.anchor}
            activeDigit={game.inputMode === 'color' ? null : game.activeDigit}
            settings={settings}
            conflicts={conflicts}
            peers={peers}
            hint={game.hint}
            readOnly={menuOpen || game.status !== 'playing'}
            onSelect={onSelect}
            onDragSelect={onDragSelect}
          />
        </div>

        <div className="controls-column">
          {game.hint && (
            <HintPanel
              hint={game.hint}
              onNext={onHintNext}
              onClose={onHintClose}
            />
          )}
          <NumberPad
            mode={game.inputMode}
            activeDigit={game.activeDigit}
            activeColor={activeColor}
            counts={counts}
            showRemaining={settings.showRemaining}
            canUndo={game.history.length > 0}
            canRedo={game.future.length > 0}
            hintActive={game.hint !== null}
            onMode={onMode}
            onDigit={onDigit}
            onColor={onColor}
            onErase={onErase}
            onUndo={onUndo}
            onRedo={onRedo}
            onHint={onHint}
          />
        </div>
      </div>

      {menuOpen && (
        <GameMenu
          onSaved={onSaved}
          onClose={() => onMenu(false)}
          onSettings={onSettings}
          onCheck={onCheck}
          onRestart={onRestart}
          onCopy={onCopy}
          copied={copied}
        />
      )}

      {game.status === 'paused' && (
        <PauseOverlay
          elapsedMs={game.elapsedMs}
          onResume={onPause}
          onExit={onBack}
        />
      )}

      {game.status === 'completed' && (
        <CompletionOverlay
          game={game}
          contextLabel={contextLabel}
          onHome={onHome}
          onAgain={onNew}
          onAnalyze={onAnalyze}
        />
      )}
    </main>
  )
}
