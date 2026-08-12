import { useMemo, useState } from 'react'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import type { GameSettings, GameState } from '../domain/types'
import {
  analyzeDifficulty,
  conflictingCells,
  type DifficultyTechnique,
} from '../engine'
import {
  replayEventLog,
  type GameEvent,
  type GameEventLog,
} from '../game'
import { Board } from './Board'
import { formatTime } from './format'
import { ArrowLeftIcon } from './icons'

interface AnalysisProps {
  game: GameState
  eventLog: GameEventLog
  settings: GameSettings
  onBack: () => void
}

const REVIEWED_ACTIONS = new Set<GameEvent['action']['type']>([
  'input/digit',
  'input/color',
  'input/erase',
  'history/undo',
  'history/redo',
  'hint/show',
  'hint/apply',
  'game/restart',
])

const TECHNIQUE_NAMES: Readonly<Record<DifficultyTechnique, string>> = {
  none: 'Leitura direta',
  invalid: 'Grade inválida',
  'search-required': 'Análise incompleta',
  'naked-single': 'Single direto',
  'hidden-single': 'Single oculto',
  'locked-candidates-pointing': 'Candidatos apontados',
  'locked-candidates-claiming': 'Candidatos confinados',
  'naked-pair': 'Par nu',
  'hidden-pair': 'Par oculto',
  'naked-triple': 'Trinca nua',
  'hidden-triple': 'Trinca oculta',
  'naked-quad': 'Quarteto nu',
  'hidden-quad': 'Quarteto oculto',
  'x-wing': 'X-Wing',
  skyscraper: 'Skyscraper',
  swordfish: 'Swordfish',
  'xy-wing': 'XY-Wing',
  jellyfish: 'Jellyfish',
}

function selectionDescription(state: GameState): string {
  if (state.selected.length === 0) return 'Nenhuma casa selecionada.'
  if (state.selected.length > 1) {
    return `${state.selected.length} casas selecionadas.`
  }
  const cell = state.selected[0] as number
  return `Linha ${Math.floor(cell / 9) + 1}, coluna ${(cell % 9) + 1}.`
}

function eventTitle(event: GameEvent | null, state: GameState): string {
  if (event === null) return 'Grade inicial'
  const action = event.action
  if (action.type === 'input/digit') {
    const mode = action.mode ?? state.inputMode
    if (mode === 'corner') return `Canto ${action.digit}`
    if (mode === 'center') return `Centro ${action.digit}`
    if (mode === 'color') return 'Marcação de cor'
    return `Número ${action.digit}`
  }
  if (action.type === 'input/color') return 'Marcação de cor'
  if (action.type === 'input/erase') return 'Apagar'
  if (action.type === 'history/undo') return 'Desfazer'
  if (action.type === 'history/redo') return 'Refazer'
  if (action.type === 'hint/show') return 'Dica solicitada'
  if (action.type === 'hint/apply') return 'Dica aplicada'
  if (action.type === 'game/restart') return 'Grade reiniciada'
  return 'Movimento'
}

export function Analysis({
  game,
  eventLog,
  settings,
  onBack,
}: AnalysisProps) {
  const reviewedEvents = useMemo(
    () => eventLog.events.filter((event) => REVIEWED_ACTIONS.has(event.action.type)),
    [eventLog.events],
  )
  const [position, setPosition] = useState(reviewedEvents.length)
  const selectedEvent = position === 0
    ? null
    : (reviewedEvents[position - 1] ?? null)
  const sequence = selectedEvent?.sequence ?? 0
  const replayed = useMemo(
    () =>
      replayEventLog(
        {
          ...eventLog,
          events: eventLog.events.filter((event) => event.sequence <= sequence),
        },
        {
          autoRemoveCandidates: settings.autoRemoveCandidates,
          errorPolicy: settings.errorPolicy,
        },
      ),
    [eventLog, sequence, settings.autoRemoveCandidates, settings.errorPolicy],
  )
  const difficulty = useMemo(
    () => analyzeDifficulty(game.puzzle.givens, game.puzzle.variant),
    [game.puzzle],
  )
  const conflicts = useMemo(
    () =>
      new Set(
        conflictingCells(
          replayed.cells.map((cell) => cell.value ?? 0),
          replayed.puzzle.variant,
        ),
      ),
    [replayed.cells, replayed.puzzle.variant],
  )
  const reviewSettings = useMemo(
    () => ({
      ...settings,
      highlightPeers: false,
      highlightMatches: false,
    }),
    [settings],
  )
  const variantName =
    VARIANTS.find((item) => item.id === game.puzzle.variant)?.name ??
    game.puzzle.variant
  const difficultyName =
    DIFFICULTIES.find((item) => item.id === game.puzzle.difficulty)?.name ??
    game.puzzle.difficulty

  return (
    <main className="page-screen analysis-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Análise</h1>
          <p>{variantName} · {difficultyName}</p>
        </div>
      </header>

      <div className="analysis-layout">
        <section className="analysis-board" aria-label="Reprodução da partida">
          <Board
            cells={replayed.cells}
            puzzle={replayed.puzzle}
            selected={replayed.selected}
            anchor={replayed.anchor}
            activeDigit={replayed.activeDigit}
            settings={reviewSettings}
            conflicts={conflicts}
            peers={new Set<number>()}
            hint={replayed.hint}
            readOnly
            onSelect={() => undefined}
            onDragSelect={() => undefined}
            onKeyDown={() => undefined}
          />
        </section>

        <section className="analysis-inspector" aria-label="Linha do tempo">
          <div className="analysis-step" aria-live="polite">
            <small>
              {position === 0
                ? 'Início'
                : `Movimento ${position} de ${reviewedEvents.length}`}
            </small>
            <h2>{eventTitle(selectedEvent, replayed)}</h2>
            <p>
              {position === 0
                ? 'A grade antes do primeiro movimento.'
                : selectionDescription(replayed)}
            </p>
          </div>

          {reviewedEvents.length > 0 && (
            <>
              <input
                className="analysis-range"
                type="range"
                min={0}
                max={reviewedEvents.length}
                step={1}
                value={position}
                aria-label="Posição na partida"
                aria-valuetext={
                  position === 0
                    ? 'Início'
                    : `Movimento ${position} de ${reviewedEvents.length}`
                }
                onChange={(event) => setPosition(Number(event.target.value))}
              />
              <div className="analysis-navigation">
                <button
                  type="button"
                  className="secondary-action"
                  disabled={position === 0}
                  onClick={() => setPosition((current) => Math.max(0, current - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={position === reviewedEvents.length}
                  onClick={() =>
                    setPosition((current) =>
                      Math.min(reviewedEvents.length, current + 1),
                    )
                  }
                >
                  Próximo
                </button>
              </div>
            </>
          )}

          <dl className="analysis-facts">
            <div>
              <dt>Técnica mais avançada</dt>
              <dd>{TECHNIQUE_NAMES[difficulty.hardestTechnique]}</dd>
            </div>
            <div>
              <dt>Caminho lógico</dt>
              <dd>
                {difficulty.steps.length}{' '}
                {difficulty.steps.length === 1 ? 'passo' : 'passos'}
              </dd>
            </div>
            <div>
              <dt>Seu tempo</dt>
              <dd>{formatTime(game.elapsedMs)}</dd>
            </div>
            <div>
              <dt>Assistência</dt>
              <dd>
                {game.hintsUsed === 0
                  ? 'Sem dicas'
                  : `${game.hintsUsed} ${game.hintsUsed === 1 ? 'dica' : 'dicas'}`}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}
