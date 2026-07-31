import { memo, useMemo } from 'react'
import type {
  CellState,
  Digit,
  GameSettings,
  HintStep,
  PuzzleDefinition,
} from '../domain/types'

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
  onSelect: (index: number, additive: boolean, range: boolean) => void
  onDragSelect: (index: number) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
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
  return `Linha ${row}, coluna ${column}, ${content}${conflict ? ', conflito' : ''}${hinted ? ', destacada pela dica' : ''}`
}

const Cell = memo(function Cell({
  cell,
  index,
  selected,
  isAnchor,
  matched,
  peer,
  conflict,
  hinted,
  diagonal,
  onSelect,
  onDragSelect,
  onKeyDown,
}: {
  cell: CellState
  index: number
  selected: boolean
  isAnchor: boolean
  matched: boolean
  peer: boolean
  conflict: boolean
  hinted: boolean
  diagonal: boolean
  onSelect: BoardProps['onSelect']
  onDragSelect: BoardProps['onDragSelect']
  onKeyDown: BoardProps['onKeyDown']
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
      data-anchor={isAnchor || undefined}
      data-given={cell.given || undefined}
      data-match={matched || undefined}
      data-peer={peer || undefined}
      data-conflict={conflict || undefined}
      data-hint={hinted || undefined}
      data-diagonal={diagonal || undefined}
      data-color={cell.color ?? undefined}
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
      tabIndex={isAnchor ? 0 : -1}
      onClick={(event) =>
        onSelect(
          index,
          event.ctrlKey || event.metaKey,
          event.shiftKey,
        )
      }
      onPointerEnter={(event) => {
        if (event.buttons === 1) onDragSelect(index)
      }}
      onKeyDown={onKeyDown}
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
  onSelect,
  onDragSelect,
  onKeyDown,
}: BoardProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const hinted = useMemo(() => new Set(hint?.cells ?? []), [hint])
  const anchorValue = cells[anchor]?.value ?? activeDigit

  return (
    <div
      className="board-frame"
      data-variant={puzzle.variant}
      aria-label={`Sudoku ${puzzle.variant}, dificuldade ${puzzle.difficulty}`}
    >
      <div className="sudoku-board" role="grid" aria-rowcount={9} aria-colcount={9}>
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
                  onSelect={onSelect}
                  onDragSelect={onDragSelect}
                  onKeyDown={onKeyDown}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
