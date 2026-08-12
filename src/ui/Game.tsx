import { useMemo } from 'react'
import type {
  CellColor,
  Digit,
  GameSettings,
  GameState,
  InputMode,
} from '../domain/types'
import { DIGIT_COLOR_MAP } from '../domain/catalog'
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
  const structuralConflicts = useMemo(
    () => new Set(conflictingCells(values, game.puzzle.variant)),
    [values, game.puzzle.variant],
  )
  const solutionConflicts = useMemo(() => {
    if (settings.errorPolicy !== 'solution' && !checking) {
      return new Set<number>()
    }
    return new Set(
      values.flatMap((value, index) =>
        value !== 0 && value !== game.puzzle.solution[index] ? [index] : [],
      ),
    )
  }, [checking, game.puzzle.solution, settings.errorPolicy, values])
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
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
    if (direction) {
      event.preventDefault()
      onMoveSelection(direction, event.shiftKey)
      return
    }

    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault()
      const digit = Number(event.key) as Digit
      const directMode = event.ctrlKey || event.metaKey
        ? 'center'
        : event.shiftKey
          ? 'corner'
          : undefined
      if (game.inputMode === 'color' && directMode === undefined) {
        const color = DIGIT_COLOR_MAP[digit]
        if (color !== undefined) onColor(color)
        return
      }
      onDigit(digit, directMode)
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      onErase()
      return
    }

    if (event.key === ' ') {
      event.preventDefault()
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
  }

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
            onSelect={onSelect}
            onDragSelect={onDragSelect}
            onKeyDown={handleKeyDown}
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
