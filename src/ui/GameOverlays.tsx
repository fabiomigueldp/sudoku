import { useEffect, useRef, type RefObject } from 'react'
import type { GameState, HintStep } from '../domain/types'
import { VARIANTS } from '../domain/catalog'
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  LightbulbIcon,
  PlayIcon,
  SlidersIcon,
} from './icons'
import { formatTime } from './format'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function useModalDialog<T extends HTMLElement>(
  layerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<T | null>,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const layer = layerRef.current
    if (layer === null) return
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const siblings = Array.from(layer.parentElement?.children ?? [])
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== layer,
      )
      .map((element) => ({ element, inert: element.inert }))

    for (const { element } of siblings) element.inert = true
    const frame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      for (const { element, inert } of siblings) element.inert = inert
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [initialFocusRef, layerRef])

  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onDismissRef.current()
      return
    }
    if (event.key !== 'Tab') return

    const layer = layerRef.current
    if (layer === null) return
    const focusable = Array.from(
      layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (first === undefined || last === undefined) {
      event.preventDefault()
      layer.focus()
      return
    }

    const active = document.activeElement
    if (event.shiftKey && (active === first || !layer.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (active === last || !layer.contains(active))
    ) {
      event.preventDefault()
      first.focus()
    }
  }
}

export function PauseOverlay({
  elapsedMs,
  onResume,
  onExit,
}: {
  elapsedMs: number
  onResume: () => void
  onExit: () => void
}) {
  const layerRef = useRef<HTMLElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const handleKeyDown = useModalDialog(layerRef, resumeRef, onResume)

  return (
    <section
      ref={layerRef}
      className="pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="pause-mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <p id="pause-title">Pausado</p>
      <strong>{formatTime(elapsedMs)}</strong>
      <div>
        <button
          ref={resumeRef}
          type="button"
          className="primary-action"
          onClick={onResume}
        >
          <PlayIcon />
          Continuar
        </button>
        <button type="button" className="secondary-action" onClick={onExit}>
          Voltar ao início
        </button>
      </div>
    </section>
  )
}

export function HintPanel({
  hint,
  onNext,
  onClose,
}: {
  hint: HintStep
  onNext: () => void
  onClose: () => void
}) {
  const techniqueNames: Record<string, string> = {
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
    'forcing-choice': 'Teste por contradição',
    conflict: 'Conflito lógico',
    'incorrect-value': 'Revisão necessária',
    contradiction: 'Contradição',
  }
  const nextLabel =
    hint.phase === 1
      ? 'Mostrar a região'
      : hint.phase === 2
        ? 'Explicar o padrão'
        : hint.phase === 3
          ? 'Mostrar o passo'
          : 'Aplicar'
  return (
    <aside className="hint-panel" aria-live="polite">
      <LightbulbIcon />
      <div>
        <small>{techniqueNames[hint.technique] ?? hint.technique}</small>
        <strong>{hint.title}</strong>
        <p>{hint.explanation}</p>
      </div>
      <div className="hint-actions">
        <button type="button" onClick={onNext}>
          {nextLabel}
        </button>
        <button type="button" className="icon-button" onClick={onClose}>
          <CloseIcon />
          <span className="sr-only">Fechar dica</span>
        </button>
      </div>
    </aside>
  )
}

export function GameMenu({
  onClose,
  onSettings,
  onCheck,
  onRestart,
  onCopy,
  copied,
}: {
  onClose: () => void
  onSettings: () => void
  onCheck: () => void
  onRestart: () => void
  onCopy: () => void
  copied: boolean
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const layer = layerRef.current
    const dialog = dialogRef.current
    if (layer === null || dialog === null) return

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const siblings = Array.from(layer.parentElement?.children ?? [])
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== layer,
      )
      .map((element) => ({ element, inert: element.inert }))

    for (const { element } of siblings) element.inert = true
    const frame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      for (const { element, inert } of siblings) element.inert = inert
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
      return
    }

    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (dialog === null) return
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getClientRects().length > 0)
    const first = focusable[0]
    const last = focusable.at(-1)
    if (first === undefined || last === undefined) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      (active === last || !dialog.contains(active))
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={layerRef}
      className="sheet-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="game-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-options-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header>
          <h2 id="game-options-title">Partida</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <CloseIcon />
            <span className="sr-only">Fechar</span>
          </button>
        </header>
        <button ref={initialFocusRef} type="button" onClick={onCheck}>
          <CheckIcon />
          <span>
            <strong>Verificar grade</strong>
            <small>Mostra conflitos apenas quando você pedir.</small>
          </span>
        </button>
        <button type="button" onClick={onSettings}>
          <SlidersIcon />
          <span>
            <strong>Ajustes do jogo</strong>
            <small>Realces, erros, resposta e aparência.</small>
          </span>
        </button>
        <button type="button" onClick={onCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>
            <strong>{copied ? 'Estado copiado' : 'Copiar estado completo'}</strong>
            <small>Grade, notas, cores e tempo em um código local.</small>
          </span>
        </button>
        <button type="button" className="danger-row" onClick={onRestart}>
          <span className="restart-symbol" aria-hidden="true">
            ↺
          </span>
          <span>
            <strong>Recomeçar esta grade</strong>
            <small>O estado atual continua disponível no desfazer.</small>
          </span>
        </button>
      </section>
    </div>
  )
}

export function CompletionOverlay({
  game,
  contextLabel,
  onHome,
  onAgain,
  onAnalyze,
}: {
  game: GameState
  contextLabel?: string | undefined
  onHome: () => void
  onAgain: () => void
  onAnalyze?: (() => void) | undefined
}) {
  const layerRef = useRef<HTMLElement>(null)
  const announcementRef = useRef<HTMLParagraphElement>(null)
  const handleKeyDown = useModalDialog(layerRef, announcementRef, onHome)

  return (
    <section
      ref={layerRef}
      className="completion-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="completion-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="completion-check" aria-hidden="true">
        <CheckIcon />
      </div>
      <p ref={announcementRef} id="completion-title" tabIndex={-1}>
        Grade concluída
      </p>
      <h2>
        {contextLabel ??
          VARIANTS.find((item) => item.id === game.puzzle.variant)?.name}
      </h2>
      <dl>
        <div>
          <dt>Tempo</dt>
          <dd>{formatTime(game.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Dicas</dt>
          <dd>{game.hintsUsed}</dd>
        </div>
        <div>
          <dt>Erros</dt>
          <dd>{game.mistakes}</dd>
        </div>
      </dl>
      <div>
        {onAnalyze && (
          <button
            type="button"
            className="primary-action"
            onClick={onAnalyze}
          >
            Rever partida
          </button>
        )}
        <button
          type="button"
          className={onAnalyze ? 'secondary-action' : 'primary-action'}
          onClick={onAgain}
        >
          Outra grade
        </button>
        <button type="button" className="secondary-action" onClick={onHome}>
          Voltar ao início
        </button>
      </div>
    </section>
  )
}
