import { useState } from 'react'
import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import type { PlayerStats } from '../domain/types'
import { practiceTechniqueDefinition } from '../engine'
import type { ArchivedGameSummary } from '../game'
import { ArrowLeftIcon, ChevronRightIcon } from './icons'
import { formatTime } from './format'

interface StatsProps {
  stats: PlayerStats
  archives: ArchivedGameSummary[]
  onBack: () => void
  onOpenArchive: (id: string) => void
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export function Stats({
  stats,
  archives,
  onBack,
  onOpenArchive,
}: StatsProps) {
  const [visibleCount, setVisibleCount] = useState(12)
  const archivedIds = new Set(archives.map((archive) => archive.id))
  const legacy = stats.records
    .filter((record) => !archivedIds.has(record.id))
    .map((record) => ({ ...record, archived: false as const }))
  const activity = [
    ...archives.map((archive) => ({ ...archive, archived: true as const })),
    ...legacy,
  ]
    .sort((left, right) => right.completedAt - left.completedAt)
    .slice(0, visibleCount)
  const cleanRate =
    stats.completed > 0
      ? Math.round((stats.cleanSolves / stats.completed) * 100)
      : 0
  const totalMistakes = stats.records.reduce(
    (total, record) => total + record.mistakes,
    0,
  )
  const averageMistakes =
    stats.completed > 0 ? totalMistakes / stats.completed : 0

  return (
    <main className="page-screen stats-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Seu jogo</h1>
        </div>
      </header>

      {stats.completed === 0 && archives.length === 0 ? (
        <section className="empty-state">
          <span className="empty-grid" aria-hidden="true" />
          <h2>A primeira linha ainda está em branco.</h2>
          <p>
            Ao concluir uma grade, seu tempo, intensidade e uso de assistência
            aparecem aqui. Tudo fica somente neste dispositivo.
          </p>
          <button type="button" className="secondary-action" onClick={onBack}>
            Voltar ao tabuleiro
          </button>
        </section>
      ) : (
        <div
          className={`stats-layout${
            stats.completed === 0 ? ' stats-layout--archive-only' : ''
          }`}
        >
          {stats.completed > 0 && (
            <section className="stats-summary" aria-label="Resumo">
              <div>
                <span>Concluídos</span>
                <strong>{stats.completed}</strong>
              </div>
              <div>
                <span>Mediana</span>
                <strong>
                  {formatTime(
                    median(stats.records.map((item) => item.elapsedMs)),
                  )}
                </strong>
              </div>
              <div>
                <span>Sem assistência</span>
                <strong>{cleanRate}%</strong>
              </div>
              <div>
                <span>Tempo de jogo</span>
                <strong>{formatTime(stats.totalTimeMs)}</strong>
              </div>
              <div>
                <span>Erros</span>
                <strong>{totalMistakes}</strong>
              </div>
              <div>
                <span>Média de erros</span>
                <strong>
                  {new Intl.NumberFormat('pt-BR', {
                    maximumFractionDigits: 1,
                  }).format(averageMistakes)}
                </strong>
              </div>
            </section>
          )}

          <section className="history-section">
            <h2>Arquivo</h2>
            <div className="history-list">
              {activity.map((record) => {
                const title =
                  record.archived && record.kind === 'practice'
                    ? `Prática · ${
                        record.practiceTechnique === null
                          ? 'Técnica'
                          : (practiceTechniqueDefinition(
                              record.practiceTechnique,
                            )?.name ?? record.practiceTechnique)
                      }`
                    : (VARIANTS.find(
                        (item) => item.id === record.variant,
                      )?.name ?? record.variant)
                const detail =
                  record.archived && record.kind === 'practice'
                    ? new Intl.DateTimeFormat('pt-BR', {
                        day: 'numeric',
                        month: 'short',
                      }).format(record.completedAt)
                    : `${
                        DIFFICULTIES.find(
                          (item) => item.id === record.difficulty,
                        )?.name ?? record.difficulty
                      } · ${new Intl.DateTimeFormat('pt-BR', {
                        day: 'numeric',
                        month: 'short',
                      }).format(record.completedAt)}`
                const content = (
                  <>
                    <span>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </span>
                    <span>
                      <strong>{formatTime(record.elapsedMs)}</strong>
                      <small>
                        {record.mistakes === 0
                          ? 'sem erros'
                          : `${record.mistakes} ${record.mistakes === 1 ? 'erro' : 'erros'}`}
                        {' · '}
                        {record.hintsUsed === 0
                          ? 'sem dicas'
                          : `${record.hintsUsed} ${record.hintsUsed === 1 ? 'dica' : 'dicas'}`}
                      </small>
                    </span>
                    {record.archived && <ChevronRightIcon />}
                  </>
                )
                return record.archived ? (
                  <button
                    key={record.id}
                    type="button"
                    className="history-row"
                    onClick={() => onOpenArchive(record.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <article key={record.id}>{content}</article>
                )
              })}
            </div>
            {visibleCount < archives.length + legacy.length && (
              <button
                type="button"
                className="history-more"
                onClick={() => setVisibleCount((count) => count + 20)}
              >
                Mostrar anteriores
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
