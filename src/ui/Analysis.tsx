import { useMemo, useState } from 'react'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import type { GameSettings, GameState, HintStep } from '../domain/types'
import {
  analyzeDifficulty,
  conflictingCells,
  practiceTechniqueDefinition,
  type DifficultyTechnique,
  type LogicalTechnique,
} from '../engine'
import {
  buildReviewFrames,
  practiceTechniqueFromPuzzle,
  type GameEvent,
  type GameEventLog,
  type ReplaySettings,
  type ReviewAssessment,
  type ReviewDelta,
  type ReviewFrame,
} from '../game'
import { Board } from './Board'
import { formatTime } from './format'
import { ArrowLeftIcon } from './icons'

interface AnalysisProps {
  game: GameState
  eventLog: GameEventLog | null
  settings: GameSettings
  replaySettings: ReplaySettings
  onBack: () => void
}

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

function deltaDescription(delta: ReviewDelta): string | null {
  const parts: string[] = []
  if (delta.valuesPlaced > 0) {
    parts.push(
      `${delta.valuesPlaced} ${delta.valuesPlaced === 1 ? 'número inserido' : 'números inseridos'}`,
    )
  }
  if (delta.valuesRemoved > 0) {
    parts.push(
      `${delta.valuesRemoved} ${delta.valuesRemoved === 1 ? 'número removido' : 'números removidos'}`,
    )
  }
  if (delta.candidatesAdded > 0) {
    parts.push(`${delta.candidatesAdded} candidatos adicionados`)
  }
  if (delta.candidatesRemoved > 0) {
    parts.push(`${delta.candidatesRemoved} candidatos removidos`)
  }
  if (delta.colorsChanged > 0) {
    parts.push(
      `${delta.colorsChanged} ${delta.colorsChanged === 1 ? 'cor alterada' : 'cores alteradas'}`,
    )
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

function assessmentDescription(
  assessment: ReviewAssessment,
  technique: LogicalTechnique | null,
): string {
  const techniqueName = technique === null
    ? null
    : TECHNIQUE_NAMES[technique]
  if (assessment === 'logical-match' && techniqueName !== null) {
    return `A jogada acompanha ${techniqueName}.`
  }
  if (assessment === 'valid-alternative') {
    return techniqueName === null
      ? 'Jogada válida.'
      : `Jogada válida por um caminho diferente de ${techniqueName}.`
  }
  if (assessment === 'incorrect') {
    return 'O valor não coincide com a solução desta grade.'
  }
  if (assessment === 'assistance') return 'Momento de assistência.'
  if (assessment === 'revision') return 'Revisão do caminho anterior.'
  if (assessment === 'annotation') return 'Anotação de apoio ao raciocínio.'
  return 'Estado inicial da grade.'
}

function logicalHint(frame: ReviewFrame): HintStep | null {
  const step = frame.logicalStep
  if (step === null) return null
  const hint: HintStep = {
    technique: step.technique,
    title: TECHNIQUE_NAMES[step.technique],
    explanation: assessmentDescription(frame.assessment, step.technique),
    cells: step.cells,
    phase: 3,
  }
  const digit = step.digits[0]
  if (digit !== undefined) hint.digit = digit
  return hint
}

function importantLabel(frame: ReviewFrame): string {
  const movement = `Movimento ${frame.position}`
  if (frame.assessment === 'incorrect') return `${movement} · Revisar valor`
  if (frame.assessment === 'assistance') return `${movement} · Assistência`
  if (frame.assessment === 'revision') return `${movement} · Revisão`
  if (frame.logicalStep !== null) {
    return `${movement} · ${TECHNIQUE_NAMES[frame.logicalStep.technique]}`
  }
  return movement
}

export function Analysis({
  game,
  eventLog,
  settings,
  replaySettings,
  onBack,
}: AnalysisProps) {
  const frames = useMemo(() => {
    if (eventLog === null) {
      return [
        {
          position: 0,
          event: null,
          state: game,
          delta: {
            cells: [],
            valuesPlaced: 0,
            valuesRemoved: 0,
            candidatesAdded: 0,
            candidatesRemoved: 0,
            colorsChanged: 0,
          },
          logicalStep: null,
          assessment: 'initial' as const,
          important: false,
        },
      ]
    }
    return buildReviewFrames(eventLog, replaySettings)
  }, [eventLog, game, replaySettings])
  const [position, setPosition] = useState(frames.length - 1)
  const frame = frames[Math.min(position, frames.length - 1)] as ReviewFrame
  const movementCount = Math.max(0, frames.length - 1)
  const importantFrames = frames.filter((entry) => entry.important)
  const difficulty = useMemo(
    () => analyzeDifficulty(game.puzzle.givens, game.puzzle.variant),
    [game.puzzle],
  )
  const conflicts = useMemo(
    () =>
      new Set(
        conflictingCells(
          frame.state.cells.map((cell) => cell.value ?? 0),
          frame.state.puzzle.variant,
        ),
      ),
    [frame.state.cells, frame.state.puzzle.variant],
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
  const practiceTechnique = practiceTechniqueFromPuzzle(game.puzzle)
  const practiceDefinition =
    practiceTechnique === null
      ? null
      : practiceTechniqueDefinition(practiceTechnique)
  const contextName =
    practiceDefinition === null
      ? `${variantName} · ${difficultyName}`
      : `Prática · ${practiceDefinition.name}`
  const deltaText = deltaDescription(frame.delta)
  const pattern = logicalHint(frame)
  const selected =
    frame.delta.cells.length > 0 ? frame.delta.cells : frame.state.selected
  const anchor = frame.delta.cells[0] ?? frame.state.anchor

  return (
    <main className="page-screen analysis-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Análise</h1>
          <p>{contextName}</p>
        </div>
      </header>

      <div className="analysis-layout">
        <section className="analysis-board" aria-label="Reprodução da partida">
          <Board
            cells={frame.state.cells}
            puzzle={frame.state.puzzle}
            selected={selected}
            anchor={anchor}
            activeDigit={frame.state.activeDigit}
            settings={reviewSettings}
            conflicts={conflicts}
            peers={new Set<number>()}
            hint={pattern}
            readOnly
            onSelect={() => undefined}
            onDragSelect={() => undefined}
          />
          {pattern && (
            <p className="analysis-legend">
              O traço interno indica o padrão lógico disponível antes desta jogada.
            </p>
          )}
        </section>

        <section className="analysis-inspector" aria-label="Linha do tempo">
          <div className="analysis-step" aria-live="polite">
            <small>
              {eventLog === null
                ? 'Estado final'
                : position === 0
                  ? 'Início'
                  : `Movimento ${position} de ${movementCount}`}
            </small>
            <h2>{eventLog === null ? 'Grade concluída' : eventTitle(frame.event, frame.state)}</h2>
            <p>
              {eventLog === null
                ? 'Esta partida foi salva sem uma linha do tempo reproduzível.'
                : position === 0
                  ? 'A grade antes do primeiro movimento.'
                  : selectionDescription(frame.state)}
            </p>
            {position > 0 && (
              <p className="analysis-assessment">
                {assessmentDescription(
                  frame.assessment,
                  frame.logicalStep?.technique ?? null,
                )}
              </p>
            )}
            {deltaText && <p className="analysis-delta">{deltaText}</p>}
          </div>

          {movementCount > 0 && (
            <>
              <input
                className="analysis-range"
                type="range"
                min={0}
                max={movementCount}
                step={1}
                value={position}
                aria-label="Posição na partida"
                aria-valuetext={
                  position === 0
                    ? 'Início'
                    : `Movimento ${position} de ${movementCount}`
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
                  disabled={position === movementCount}
                  onClick={() =>
                    setPosition((current) => Math.min(movementCount, current + 1))
                  }
                >
                  Próximo
                </button>
              </div>
            </>
          )}

          {importantFrames.length > 0 && (
            <label className="analysis-moments">
              <span>Momentos importantes</span>
              <select
                value={frame.important ? frame.position : ''}
                onChange={(event) => {
                  if (event.target.value) setPosition(Number(event.target.value))
                }}
              >
                <option value="">Ir para…</option>
                {importantFrames.map((important) => (
                  <option key={important.position} value={important.position}>
                    {importantLabel(important)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <dl className="analysis-facts">
            {practiceDefinition !== null && (
              <div>
                <dt>Técnica praticada</dt>
                <dd>{practiceDefinition.name}</dd>
              </div>
            )}
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
            <div>
              <dt>Erros</dt>
              <dd>{game.mistakes}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}
