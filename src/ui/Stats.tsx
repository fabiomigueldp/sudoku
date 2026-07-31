import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import type { PlayerStats } from '../domain/types'
import { ArrowLeftIcon } from './icons'
import { formatTime } from './format'

interface StatsProps {
  stats: PlayerStats
  onBack: () => void
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export function Stats({ stats, onBack }: StatsProps) {
  const recent = [...stats.records]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 12)
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

      {stats.completed === 0 ? (
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
        <div className="stats-layout">
          <section className="stats-summary" aria-label="Resumo">
            <div>
              <span>Concluídos</span>
              <strong>{stats.completed}</strong>
            </div>
            <div>
              <span>Mediana</span>
              <strong>
                {formatTime(median(stats.records.map((item) => item.elapsedMs)))}
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

          <section className="history-section">
            <h2>Atividade recente</h2>
            <div className="history-list">
              {recent.map((record) => (
                <article key={record.id}>
                  <span>
                    <strong>
                      {
                        VARIANTS.find((item) => item.id === record.variant)
                          ?.name
                      }
                    </strong>
                    <small>
                      {
                        DIFFICULTIES.find(
                          (item) => item.id === record.difficulty,
                        )?.name
                      }{' '}
                      ·{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: 'numeric',
                        month: 'short',
                      }).format(record.completedAt)}
                    </small>
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
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
