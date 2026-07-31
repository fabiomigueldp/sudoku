import type {
  CellColor,
  Digit,
  InputMode,
} from '../domain/types'
import { CELL_COLORS } from '../domain/catalog'
import {
  CheckIcon,
  EraserIcon,
  LightbulbIcon,
  RedoIcon,
  UndoIcon,
} from './icons'

interface NumberPadProps {
  mode: InputMode
  activeDigit: Digit | null
  activeColor: CellColor | null
  counts: number[]
  showRemaining: boolean
  canUndo: boolean
  canRedo: boolean
  hintActive: boolean
  onMode: (mode: InputMode) => void
  onDigit: (digit: Digit) => void
  onColor: (color: CellColor) => void
  onErase: () => void
  onUndo: () => void
  onRedo: () => void
  onHint: () => void
}

const modes: Array<{ id: InputMode; label: string; short: string }> = [
  { id: 'value', label: 'Número', short: 'Número' },
  { id: 'corner', label: 'Canto', short: 'Canto' },
  { id: 'center', label: 'Centro', short: 'Centro' },
  { id: 'color', label: 'Cor', short: 'Cor' },
]

export function NumberPad({
  mode,
  activeDigit,
  activeColor,
  counts,
  showRemaining,
  canUndo,
  canRedo,
  hintActive,
  onMode,
  onDigit,
  onColor,
  onErase,
  onUndo,
  onRedo,
  onHint,
}: NumberPadProps) {
  return (
    <section className="input-panel" aria-label="Controles de entrada">
      <div className="mode-switch" role="radiogroup" aria-label="Modo de entrada">
        {modes.map((item) => (
          <button
            type="button"
            key={item.id}
            role="radio"
            aria-checked={mode === item.id}
            className="mode-button"
            data-active={mode === item.id || undefined}
            onClick={() => onMode(item.id)}
          >
            <span className="mode-label-full">{item.label}</span>
            <span className="mode-label-short">{item.short}</span>
          </button>
        ))}
      </div>

      {mode === 'color' ? (
        <div
          className="color-pad"
          role="group"
          aria-label="Cores de marcação"
        >
          {CELL_COLORS.map((color) => {
            const active = activeColor === color.id
            return (
              <button
                type="button"
                key={color.id}
                className="color-key"
                data-color={color.id}
                data-active={active || undefined}
                aria-pressed={active}
                aria-keyshortcuts={String(color.shortcut)}
                aria-label={`${active ? 'Remover' : 'Aplicar'} marcação ${color.label.toLocaleLowerCase('pt-BR')}`}
                onClick={() => onColor(color.id)}
              >
                {active && <CheckIcon />}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="number-pad" aria-label="Números">
          {Array.from({ length: 9 }, (_, index) => {
            const digit = (index + 1) as Digit
            const remaining = 9 - (counts[index] ?? 0)
            const inputLabel =
              mode === 'corner'
                ? `${digit}, marca de canto`
                : mode === 'center'
                  ? `${digit}, marca central`
                  : `${digit}`
            return (
              <button
                type="button"
                className="number-key"
                key={digit}
                data-active={activeDigit === digit || undefined}
                disabled={remaining === 0 && mode === 'value'}
                onClick={() => onDigit(digit)}
                aria-label={
                  showRemaining
                    ? `${inputLabel}, ${remaining === 0 ? 'completo' : `${remaining} restantes`}`
                    : inputLabel
                }
              >
                <span>{digit}</span>
                <small aria-hidden="true">
                  {showRemaining ? (remaining > 0 ? remaining : '·') : ''}
                </small>
              </button>
            )
          })}
        </div>
      )}

      <div className="action-row">
        <button
          type="button"
          className="tool-button"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <UndoIcon />
          <span>Desfazer</span>
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <RedoIcon />
          <span>Refazer</span>
        </button>
        <button type="button" className="tool-button" onClick={onErase}>
          <EraserIcon />
          <span>Apagar</span>
        </button>
        <button
          type="button"
          className="tool-button"
          data-active={hintActive || undefined}
          onClick={onHint}
        >
          <LightbulbIcon />
          <span>Dica</span>
        </button>
      </div>
    </section>
  )
}
