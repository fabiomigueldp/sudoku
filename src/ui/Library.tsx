import { useState } from 'react'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import type { DifficultyId, VariantId } from '../domain/types'
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon } from './icons'

interface LibraryProps {
  onBack: () => void
  onStart: (variant: VariantId, difficulty: DifficultyId) => void
  onImport: (
    value: string,
    variant: VariantId,
    difficulty: DifficultyId,
  ) => string | null
  generating: boolean
  error: string | null
}

export function Library({
  onBack,
  onStart,
  onImport,
  generating,
  error,
}: LibraryProps) {
  const [variant, setVariant] = useState<VariantId>('classic')
  const [difficulty, setDifficulty] = useState<DifficultyId>('focused')
  const [importOpen, setImportOpen] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const activeVariant = VARIANTS.find((item) => item.id === variant)!

  return (
    <main className="page-screen library-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Novo Sudoku</h1>
          <p>Escolha a regra e o tipo de raciocínio.</p>
        </div>
      </header>

      <div className="library-layout">
        {error && (
          <p className="generation-error" role="alert">
            {error}
          </p>
        )}
        <section className="option-section" aria-labelledby="variant-title">
          <h2 id="variant-title">Variação</h2>
          <div className="variant-list" role="radiogroup">
            {VARIANTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={variant === item.id}
                className="choice-row"
                data-selected={variant === item.id || undefined}
                onClick={() => setVariant(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                {variant === item.id ? <CheckIcon /> : <span className="choice-dot" />}
              </button>
            ))}
          </div>
        </section>

        <section className="option-section" aria-labelledby="difficulty-title">
          <h2 id="difficulty-title">Intensidade</h2>
          <div className="difficulty-scale" role="radiogroup">
            {DIFFICULTIES.map((item, index) => (
              <button
                type="button"
                key={item.id}
                role="radio"
                aria-checked={difficulty === item.id}
                data-selected={difficulty === item.id || undefined}
                onClick={() => setDifficulty(item.id)}
              >
                <span className="difficulty-index">
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                {difficulty === item.id && <CheckIcon />}
              </button>
            ))}
          </div>
        </section>

        <section className="import-section" aria-labelledby="import-title">
          <button
            type="button"
            className="import-toggle"
            aria-expanded={importOpen}
            onClick={() => {
              setImportOpen((open) => !open)
              setImportError(null)
            }}
          >
            <span>
              <strong id="import-title">Importar uma grade</strong>
              <small>81 dígitos, pontos ou um código do Absolute.</small>
            </span>
            <span aria-hidden="true">{importOpen ? '−' : '+'}</span>
          </button>
          {importOpen && (
            <form
              className="import-form"
              onSubmit={(event) => {
                event.preventDefault()
                const result = onImport(importValue, variant, difficulty)
                setImportError(result)
              }}
            >
              <label htmlFor="puzzle-import">
                Grade ou estado compartilhado
              </label>
              <textarea
                id="puzzle-import"
                rows={3}
                value={importValue}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="53..7....6..195..."
                onChange={(event) => {
                  setImportValue(event.target.value)
                  setImportError(null)
                }}
              />
              {importError && (
                <p className="import-error" role="alert">
                  {importError}
                </p>
              )}
              <button
                type="submit"
                className="secondary-action"
                disabled={!importValue.trim()}
              >
                Abrir grade
              </button>
            </form>
          )}
        </section>

        <aside className="selection-summary">
          <span>
            <small>Próxima grade</small>
            <strong>
              {activeVariant.name} ·{' '}
              {DIFFICULTIES.find((item) => item.id === difficulty)?.name}
            </strong>
          </span>
          <button
            type="button"
            className="primary-action"
            disabled={generating}
            onClick={() => onStart(variant, difficulty)}
          >
            {generating ? 'Construindo grade…' : 'Começar'}
            {!generating && <ChevronRightIcon />}
          </button>
        </aside>
      </div>
    </main>
  )
}
