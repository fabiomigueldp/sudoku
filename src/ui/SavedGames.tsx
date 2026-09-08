import { useEffect, useRef, useState } from 'react'
import type { SavedGameSummary } from '../game'
import { ArrowLeftIcon, ChevronRightIcon } from './icons'
import { formatTime } from './format'
import { savedDateLabel, sessionContext, sessionLabel } from './sessionFormat'

interface SavedGamesProps {
  sessions: SavedGameSummary[]
  openingId: string | null
  error: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onNew: () => void
  onBack: () => void
}

function BoardPreview({ values }: { values: number[] }) {
  return (
    <span className="saved-board" aria-hidden="true">
      {values.map((value, index) => (
        <span key={index} data-entered={value > 0 || undefined}>
          {value === 0 ? '' : Math.abs(value)}
        </span>
      ))}
    </span>
  )
}

export function SavedGames({ sessions, openingId, error, onOpen, onDelete, onNew, onBack }: SavedGamesProps) {
  const [organizing, setOrganizing] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [visibleCount, setVisibleCount] = useState(12)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const organizeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusAfterDeleteRef = useRef(false)
  const busy = openingId !== null || deleting

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (confirmId) cancelRef.current?.focus({ preventScroll: true })
  }, [confirmId])
  useEffect(() => {
    if (!deleting && restoreFocusAfterDeleteRef.current) {
      restoreFocusAfterDeleteRef.current = false
      ;(organizeRef.current ?? titleRef.current)?.focus({ preventScroll: true })
    }
  }, [deleting, sessions.length])

  const cancelDelete = () => {
    setConfirmId(null)
    setDeleteError(null)
    deleteTriggerRef.current?.focus({ preventScroll: true })
  }

  return (
    <main className="page-screen saved-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack} disabled={busy}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1 ref={titleRef} tabIndex={-1}>Partidas salvas</h1>
          <p>Cada grade continua de onde você parou.</p>
        </div>
      </header>

      <section className="saved-layout" aria-label="Partidas em andamento" aria-busy={busy}>
        <div className="saved-toolbar">
          <p>{sessions.length} em andamento</p>
          {sessions.length > 0 && (
            <button
              ref={organizeRef}
              type="button"
              className="text-icon-button"
              aria-pressed={organizing}
              disabled={busy}
              onClick={() => {
                setOrganizing(!organizing)
                setConfirmId(null)
                setDeleteError(null)
              }}
            >
              {organizing ? 'Concluir organização' : 'Organizar'}
            </button>
          )}
        </div>
        {error && <p className="generation-error" role="alert">{error}</p>}
        <p className="sr-only" role="status">{announcement}</p>

        {sessions.length === 0 ? (
          <div className="saved-empty">
            <h2>Espaço para a próxima grade.</h2>
            <p>Suas partidas são salvas automaticamente. Você pode começar outra e voltar quando quiser.</p>
          </div>
        ) : (
          <ul className="saved-list">
            {sessions.slice(0, visibleCount).map((session, index) => {
              const label = sessionLabel(session)
              const context = sessionContext(session)
              const confirming = confirmId === session.id
              return (
                <li key={session.id} className="saved-item">
                  <div className="saved-row">
                    <button
                      type="button"
                      className="saved-open"
                      disabled={busy || confirmId !== null}
                      onClick={() => onOpen(session.id)}
                      aria-label={`Continuar ${label}, ${session.filled} de ${session.total} preenchidas, ${savedDateLabel(session.savedAt)}`}
                    >
                      <BoardPreview values={session.preview} />
                      <span className="saved-description">
                        {(index === 0 || context) && <span className="saved-context">{index === 0 ? 'Última partida' : context}</span>}
                        <strong>{label}</strong>
                        {index === 0 && context && <span className="saved-context">{context}</span>}
                        <span className="saved-progress">
                          {openingId === session.id ? 'Abrindo partida…' : (
                            <>{session.filled} de {session.total} preenchidas <span className="saved-time"><span aria-hidden="true">· </span>{formatTime(session.elapsedMs)}</span></>
                          )}
                        </span>
                        <time dateTime={new Date(session.savedAt).toISOString()}>{savedDateLabel(session.savedAt)}</time>
                      </span>
                      <ChevronRightIcon />
                    </button>
                    {organizing && (
                      <button
                        type="button"
                        className="saved-delete"
                        aria-label={`Excluir ${label}, ${savedDateLabel(session.savedAt)}`}
                        aria-expanded={confirming}
                        disabled={busy || (confirmId !== null && !confirming)}
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget
                          setConfirmId(session.id)
                          setDeleteError(null)
                        }}
                      >Excluir</button>
                    )}
                  </div>
                  {confirming && (
                    <div
                      className="saved-confirmation"
                      role="group"
                      aria-label={`Excluir partida ${label}`}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && !deleting) {
                          event.preventDefault()
                          cancelDelete()
                        }
                      }}
                    >
                      <p>Excluir esta partida? O progresso e as anotações serão apagados.</p>
                      {deleteError && <p role="alert">{deleteError}</p>}
                      <div>
                        <button ref={cancelRef} type="button" className="secondary-action" onClick={cancelDelete} disabled={deleting}>Manter partida</button>
                        <button
                          type="button"
                          className="secondary-action saved-confirm-delete"
                          disabled={deleting}
                          onClick={async () => {
                            setDeleting(true)
                            try {
                              await onDelete(session.id)
                              restoreFocusAfterDeleteRef.current = true
                              setConfirmId(null)
                              setAnnouncement('Partida excluída.')
                            } catch {
                              setDeleteError('Não foi possível excluir. Tente novamente.')
                            } finally {
                              setDeleting(false)
                            }
                          }}
                        >{deleting ? 'Excluindo…' : 'Excluir partida'}</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {sessions.length > visibleCount && (
          <button type="button" className="secondary-action saved-more" onClick={() => setVisibleCount((count) => count + 12)} disabled={busy}>Mostrar mais partidas</button>
        )}
        <button type="button" className="new-game-action saved-new" onClick={onNew} disabled={busy}>
          <strong>Novo Sudoku</strong>
          <ChevronRightIcon />
        </button>
        {sessions.length > 0 && <p className="saved-footnote">Salvas automaticamente neste dispositivo.</p>}
      </section>
    </main>
  )
}
