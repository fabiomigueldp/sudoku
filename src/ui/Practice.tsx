import { useMemo } from 'react'
import {
  PRACTICE_TECHNIQUES,
  type LogicalTechnique,
  type PracticeTechniqueDefinition,
} from '../engine'
import type { PracticeProgress } from '../game'
import { ArrowLeftIcon, ChevronRightIcon } from './icons'
import { formatTime } from './format'

interface PracticeProps {
  progress: PracticeProgress
  generating: LogicalTechnique | null
  error: string | null
  onBack: () => void
  onStart: (technique: LogicalTechnique) => void
}

const FAMILY_LABELS: Readonly<
  Record<PracticeTechniqueDefinition['family'], string>
> = {
  fundamentos: 'Fundamentos',
  interações: 'Interações',
  subconjuntos: 'Subconjuntos',
  padrões: 'Padrões',
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  const center = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 1
    ? (ordered[center] ?? 0)
    : ((ordered[center - 1] ?? 0) + (ordered[center] ?? 0)) / 2
}

function historyLabel(
  technique: LogicalTechnique,
  progress: PracticeProgress,
): string {
  const records = progress.records.filter(
    (record) => record.technique === technique,
  )
  if (records.length === 0) return 'Ainda não praticada'
  const independent = records.filter(
    (record) => record.hintsUsed === 0 && record.mistakes === 0,
  ).length
  const sessions = `${records.length} ${records.length === 1 ? 'sessão' : 'sessões'}`
  const clean =
    independent === 0
      ? 'com assistência'
      : `${independent} sem assistência`
  return `${sessions} · ${clean} · mediana ${formatTime(
    median(records.map((record) => record.elapsedMs)),
  )}`
}

export function Practice({
  progress,
  generating,
  error,
  onBack,
  onStart,
}: PracticeProps) {
  const groups = useMemo(
    () =>
      (Object.keys(FAMILY_LABELS) as PracticeTechniqueDefinition['family'][])
        .map((family) => ({
          family,
          techniques: PRACTICE_TECHNIQUES.filter(
            (technique) => technique.family === family,
          ),
        }))
        .filter((group) => group.techniques.length > 0),
    [],
  )

  return (
    <main className="page-screen practice-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Prática</h1>
          <p>Escolha o padrão que deseja reconhecer.</p>
        </div>
      </header>

      <div className="practice-layout">
        {error && (
          <p className="generation-error" role="alert">
            {error}
          </p>
        )}
        {groups.map((group) => (
          <section
            key={group.family}
            className="practice-section"
            aria-labelledby={`practice-${group.family}`}
          >
            <h2 id={`practice-${group.family}`}>
              {FAMILY_LABELS[group.family]}
            </h2>
            <div className="practice-list">
              {group.techniques.map((technique) => (
                <button
                  key={technique.id}
                  type="button"
                  className="practice-row"
                  disabled={generating !== null}
                  onClick={() => onStart(technique.id)}
                >
                  <span>
                    <strong>
                      {generating === technique.id
                        ? 'Construindo grade…'
                        : technique.name}
                    </strong>
                    <small>{technique.description}</small>
                    <small className="practice-history">
                      {historyLabel(technique.id, progress)}
                    </small>
                  </span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
