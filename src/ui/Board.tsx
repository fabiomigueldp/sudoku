import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type {
  CellState,
  Digit,
  GameSettings,
  HintStep,
  PuzzleDefinition,
} from '../domain/types'
import { CELL_COLOR_LABELS } from '../domain/catalog'

interface BoardProps {
  cells: CellState[]
  puzzle: PuzzleDefinition
  selected: number[]
  anchor: number
  activeDigit: Digit | null
  settings: GameSettings
  conflicts: ReadonlySet<number>
  peers: ReadonlySet<number>
  hint: HintStep | null
  readOnly?: boolean
  onSelect: (index: number, additive: boolean, range: boolean) => void
  onDragSelect: (index: number) => void
}

function cellLabel(
  cell: CellState,
  index: number,
  conflict: boolean,
  hinted: boolean,
) {
  const row = Math.floor(index / 9) + 1
  const column = (index % 9) + 1
  const content = cell.value
    ? `${cell.given ? 'pista' : 'valor'} ${cell.value}`
    : cell.corner.length || cell.center.length
      ? `vazia${cell.corner.length ? `, marcas de canto ${cell.corner.join(', ')}` : ''}${cell.center.length ? `, marcas centrais ${cell.center.join(', ')}` : ''}`
      : 'vazia'
  const color = cell.color
    ? `, marcação de cor ${CELL_COLOR_LABELS[cell.color].toLocaleLowerCase('pt-BR')}`
    : ''
  return `Linha ${row}, coluna ${column}, ${content}${color}${conflict ? ', conflito' : ''}${hinted ? ', destacada pela dica' : ''}`
}

const Cell = memo(function Cell({
  cell,
  index,
  selected,
  isAnchor,
  tabStop,
  matched,
  peer,
  conflict,
  hinted,
  diagonal,
  readOnly,
  onSelect,
}: {
  cell: CellState
  index: number
  selected: boolean
  isAnchor: boolean
  tabStop: boolean
  matched: boolean
  peer: boolean
  conflict: boolean
  hinted: boolean
  diagonal: boolean
  readOnly: boolean
  onSelect: BoardProps['onSelect']
}) {
  return (
    <button
      type="button"
      role="gridcell"
      className={[
        'sudoku-cell',
        index % 9 === 2 || index % 9 === 5 ? 'is-box-right' : '',
        Math.floor(index / 9) === 2 || Math.floor(index / 9) === 5
          ? 'is-box-bottom'
          : '',
        index % 9 === 8 ? 'is-last-column' : '',
        Math.floor(index / 9) === 8 ? 'is-last-row' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-selected={selected || undefined}
      data-cell-index={index}
      data-anchor={isAnchor || undefined}
      data-given={cell.given || undefined}
      data-match={matched || undefined}
      data-peer={peer || undefined}
      data-conflict={conflict || undefined}
      data-hint={hinted || undefined}
      data-diagonal={diagonal || undefined}
      data-color={cell.color ?? undefined}
      data-readonly={readOnly || undefined}
      data-notes={
        cell.corner.length > 0 && cell.center.length > 0
          ? 'mixed'
          : cell.corner.length > 0
            ? 'corner'
            : cell.center.length > 0
              ? 'center'
              : undefined
      }
      aria-label={cellLabel(cell, index, conflict, hinted)}
      aria-selected={selected}
      aria-invalid={conflict || undefined}
      aria-rowindex={Math.floor(index / 9) + 1}
      aria-colindex={(index % 9) + 1}
      tabIndex={!readOnly && tabStop ? 0 : -1}
      onClick={
        readOnly
          ? undefined
          : (event) => {
              // Pointer gestures select at pointerdown. Keep synthetic clicks
              // available for keyboards and assistive technology.
              if (event.detail !== 0) return
              onSelect(
                index,
                event.ctrlKey || event.metaKey,
                event.shiftKey,
              )
            }
      }
    >
      {cell.value ? (
        <span className="cell-value">{cell.value}</span>
      ) : (
        <>
          <span className="corner-notes" aria-hidden="true">
            {Array.from({ length: 9 }, (_, candidate) => (
              <span key={candidate}>
                {cell.corner.includes((candidate + 1) as Digit)
                  ? candidate + 1
                  : ''}
              </span>
            ))}
          </span>
          {cell.center.length > 0 && (
            <span className="center-notes" aria-hidden="true">
              {cell.center.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          )}
        </>
      )}
      {cell.color && <span className="cell-color-marker" aria-hidden="true" />}
      {hinted && <span className="hint-cell-marker" aria-hidden="true" />}
      {conflict && <span className="conflict-cell-marker" aria-hidden="true" />}
    </button>
  )
})

export function Board({
  cells,
  puzzle,
  selected,
  anchor,
  activeDigit,
  settings,
  conflicts,
  peers,
  hint,
  readOnly = false,
  onSelect,
  onDragSelect,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
    visited: Set<number>
  } | null>(null)

  useEffect(() => {
    const cancel = () => {
      gestureRef.current = null
    }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => {
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', cancel)
    }
  }, [])

  useLayoutEffect(() => {
    if (readOnly) gestureRef.current = null
    const board = boardRef.current
    if (!readOnly && board?.contains(document.activeElement)) {
      board.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true })
    }
  }, [anchor, readOnly])

  const pointerCell = (target: EventTarget | null) => {
    const cell = target instanceof Element
      ? target.closest<HTMLElement>('[data-cell-index]')
      : null
    return cell && boardRef.current?.contains(cell) ? cell : null
  }

  const startGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !event.isPrimary || event.button !== 0 || gestureRef.current) return
    const cell = pointerCell(event.target)
    if (!cell) return
    const index = Number(cell.dataset.cellIndex)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      visited: new Set([index]),
    }
    cell.focus({ preventScroll: true })
    onSelect(index, event.ctrlKey || event.metaKey, event.shiftKey)
  }

  const moveGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (readOnly || gesture?.pointerId !== event.pointerId) return
    if (event.buttons !== 1) {
      gestureRef.current = null
      return
    }
    // A small tremor near a cell edge must not become a multi-cell gesture.
    if (!gesture.dragging && Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    ) < 6) return
    gesture.dragging = true
    const cell = pointerCell(document.elementFromPoint(event.clientX, event.clientY))
    if (!cell) return
    const index = Number(cell.dataset.cellIndex)
    if (gesture.visited.has(index)) return
    gesture.visited.add(index)
    onDragSelect(index)
  }

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const hinted = useMemo(() => new Set(hint?.cells ?? []), [hint])
  const anchorValue = cells[anchor]?.value ?? activeDigit

  return (
    <div
      className="board-frame"
      data-variant={puzzle.variant}
      aria-label={`Sudoku ${puzzle.variant}, dificuldade ${puzzle.difficulty}`}
    >
      <div
        ref={boardRef}
        className="sudoku-board"
        role="grid"
        aria-readonly={readOnly || undefined}
        aria-rowcount={9}
        aria-colcount={9}
        onPointerDown={startGesture}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        {Array.from({ length: 9 }, (_, row) => (
          <div role="row" className="board-row" key={row}>
            {cells.slice(row * 9, row * 9 + 9).map((cell, column) => {
              const index = row * 9 + column
              const isDiagonal =
                puzzle.variant === 'diagonal' &&
                (row === column || row + column === 8)
              return (
                <Cell
                  key={index}
                  cell={cell}
                  index={index}
                  selected={selectedSet.has(index)}
                  isAnchor={index === anchor}
                  tabStop={index === (anchor >= 0 ? anchor : 0)}
                  matched={
                    settings.highlightMatches &&
                    anchorValue !== null &&
                    (cell.value === anchorValue ||
                      (!cell.value &&
                        settings.highlightCandidates &&
                        (cell.corner.includes(anchorValue) ||
                          cell.center.includes(anchorValue))))
                  }
                  peer={settings.highlightPeers && peers.has(index)}
                  conflict={conflicts.has(index)}
                  hinted={hinted.has(index)}
                  diagonal={isDiagonal}
                  readOnly={readOnly}
                  onSelect={onSelect}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
