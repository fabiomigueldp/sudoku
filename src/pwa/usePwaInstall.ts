import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export type PwaInstallKind = 'native' | 'ios-safari' | 'ios-browser'

export interface PwaInstallControl {
  kind: PwaInstallKind | null
  guidance: string | null
  instructionsOpen: boolean
  install: () => Promise<void>
}

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean
  }
  return (
    navigatorWithStandalone.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  )
}

function isIos() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isMobile() {
  return isIos() || /Android/i.test(navigator.userAgent)
}

function isIosSafari() {
  return (
    isIos() &&
    /Safari/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
  )
}

function initialInstallKind(): PwaInstallKind | null {
  if (isStandalone() || !isIos()) return null
  return isIosSafari() ? 'ios-safari' : 'ios-browser'
}

export function usePwaInstall(): PwaInstallControl {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [kind, setKind] = useState<PwaInstallKind | null>(
    initialInstallKind,
  )
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')

    const handleBeforeInstall = (event: Event) => {
      if (!isMobile() || isStandalone()) return
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setInstructionsOpen(false)
      setKind('native')
    }

    const handleInstalled = () => {
      promptRef.current = null
      setInstructionsOpen(false)
      setKind(null)
    }

    const handleDisplayMode = () => {
      if (displayMode.matches) handleInstalled()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    displayMode.addEventListener('change', handleDisplayMode)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
      displayMode.removeEventListener('change', handleDisplayMode)
    }
  }, [])

  const install = useCallback(async () => {
    if (kind !== 'native') {
      setInstructionsOpen((open) => !open)
      return
    }

    const prompt = promptRef.current
    if (prompt === null) return

    promptRef.current = null
    setKind(null)
    try {
      await prompt.prompt()
      await prompt.userChoice
    } catch {
      // The browser owns this prompt; a failed request must not block the app.
    }
  }, [kind])

  const guidance =
    kind === 'ios-safari'
      ? 'Compartilhar → Adicionar à Tela de Início.'
      : kind === 'ios-browser'
        ? 'Abra esta página no Safari para instalar.'
        : null

  return {
    kind,
    guidance,
    instructionsOpen,
    install,
  }
}
