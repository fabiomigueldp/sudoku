import { useRef, useState } from 'react'
import type {
  ErrorPolicy,
  GameSettings,
  ThemePreference,
} from '../domain/types'
import type { BackupRestoreResult, BackupSummary } from '../game'
import { ArrowLeftIcon, CheckIcon } from './icons'

interface SettingsProps {
  settings: GameSettings
  onChange: (settings: GameSettings) => void
  onBack: () => void
  onExportData: () => Promise<BackupSummary>
  onInspectBackup: (serialized: string) => BackupSummary
  onRestoreData: (serialized: string) => Promise<BackupRestoreResult>
  onClearData: () => Promise<void>
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-control" aria-hidden="true" />
    </label>
  )
}

export function Settings({
  settings,
  onChange,
  onBack,
  onExportData,
  onInspectBackup,
  onRestoreData,
  onClearData,
}: SettingsProps) {
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [dataMessage, setDataMessage] = useState<string | null>(null)
  const [dataBusy, setDataBusy] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<{
    serialized: string
    summary: BackupSummary
  } | null>(null)
  const update = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K],
  ) => onChange({ ...settings, [key]: value })

  const themeOptions: Array<{ id: ThemePreference; label: string }> = [
    { id: 'system', label: 'Sistema' },
    { id: 'light', label: 'Claro' },
    { id: 'dark', label: 'Escuro' },
  ]
  const errorOptions: Array<{
    id: ErrorPolicy
    label: string
    description: string
  }> = [
    {
      id: 'conflicts',
      label: 'Somente conflitos',
      description: 'Mostra duplicações nas regras visíveis.',
    },
    {
      id: 'solution',
      label: 'Comparar à solução',
      description: 'Sinaliza imediatamente um valor incorreto.',
    },
    {
      id: 'on-demand',
      label: 'Quando eu pedir',
      description: 'Nunca interfere no raciocínio.',
    },
    {
      id: 'completion',
      label: 'Ao concluir',
      description: 'Verifica apenas quando a grade estiver cheia.',
    },
  ]

  const describeBackup = (summary: BackupSummary) => {
    const parts = [
      `${summary.archivedGames} ${summary.archivedGames === 1 ? 'partida' : 'partidas'}`,
      `${summary.practiceSessions} ${summary.practiceSessions === 1 ? 'prática' : 'práticas'}`,
    ]
    if (summary.hasActiveSession) parts.push('uma partida em andamento')
    return parts.join(' · ')
  }

  return (
    <main className="page-screen settings-screen">
      <header className="page-header">
        <button type="button" className="icon-button" onClick={onBack}>
          <ArrowLeftIcon />
          <span className="sr-only">Voltar</span>
        </button>
        <div>
          <h1>Ajustes</h1>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-section">
          <h2>Aparência</h2>
          <div className="segmented-control" role="radiogroup" aria-label="Tema">
            {themeOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                role="radio"
                aria-checked={settings.theme === option.id}
                data-active={settings.theme === option.id || undefined}
                onClick={() => update('theme', option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <SettingRow
            title="Alto contraste"
            description="Reforça limites, foco e estados do tabuleiro."
            checked={settings.highContrast}
            onChange={(value) => update('highContrast', value)}
          />
          <SettingRow
            title="Reduzir movimento"
            description="Remove transições não essenciais."
            checked={settings.reduceMotion}
            onChange={(value) => update('reduceMotion', value)}
          />
          <SettingRow
            title="Mostrar cronômetro"
            description="O tempo pausa quando o app fica em segundo plano."
            checked={settings.showTimer}
            onChange={(value) => update('showTimer', value)}
          />
        </section>

        <section className="settings-section">
          <h2>Assistência visual</h2>
          <SettingRow
            title="Regiões relacionadas"
            description="Realça linha, coluna, bloco e restrições da variante."
            checked={settings.highlightPeers}
            onChange={(value) => update('highlightPeers', value)}
          />
          <SettingRow
            title="Números iguais"
            description="Realça valores e candidatos iguais ao selecionado."
            checked={settings.highlightMatches}
            onChange={(value) => update('highlightMatches', value)}
          />
          <SettingRow
            title="Contagem restante"
            description="Mostra discretamente quantos dígitos ainda faltam."
            checked={settings.showRemaining}
            onChange={(value) => update('showRemaining', value)}
          />
          <SettingRow
            title="Candidatos automáticos"
            description="Preenche possibilidades válidas nas casas ainda sem notas."
            checked={settings.autoCandidates}
            onChange={(value) => update('autoCandidates', value)}
          />
          <SettingRow
            title="Remover candidatos"
            description="Ao inserir um número, limpa candidatos nos pares."
            checked={settings.autoRemoveCandidates}
            onChange={(value) => update('autoRemoveCandidates', value)}
          />
        </section>

        <section className="settings-section error-section">
          <h2>Verificação de erros</h2>
          <div className="error-options" role="radiogroup">
            {errorOptions.map((option) => (
              <button
                type="button"
                key={option.id}
                role="radio"
                aria-checked={settings.errorPolicy === option.id}
                data-selected={settings.errorPolicy === option.id || undefined}
                onClick={() => update('errorPolicy', option.id)}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {settings.errorPolicy === option.id && <CheckIcon />}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>Resposta</h2>
          <SettingRow
            title="Háptica"
            checked={settings.haptics}
            onChange={(value) => update('haptics', value)}
          />
          <SettingRow
            title="Som"
            checked={settings.sound}
            onChange={(value) => update('sound', value)}
          />
        </section>

        <section className="settings-section data-section">
          <h2>Dados</h2>
          <div className="data-actions">
            <button
              type="button"
              className="data-row"
              disabled={dataBusy}
              onClick={() => {
                setDataBusy(true)
                setDataMessage(null)
                void onExportData()
                  .then((summary) => {
                    setDataMessage(`Backup criado · ${describeBackup(summary)}`)
                  })
                  .catch((error: unknown) => {
                    setDataMessage(
                      error instanceof Error
                        ? error.message
                        : 'Não foi possível criar o backup.',
                    )
                  })
                  .finally(() => setDataBusy(false))
              }}
            >
              <span>
                <strong>Exportar backup</strong>
                <small>Partidas, análises, prática e preferências.</small>
              </span>
            </button>

            <button
              type="button"
              className="data-row"
              disabled={dataBusy}
              onClick={() => {
                setClearPending(false)
                restoreInputRef.current?.click()
              }}
            >
              <span>
                <strong>Restaurar backup</strong>
                <small>Substitui os dados deste dispositivo após confirmação.</small>
              </span>
            </button>
            <input
              ref={restoreInputRef}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.currentTarget.value = ''
                if (file === undefined) return
                setClearPending(false)
                if (file.size > 50 * 1024 * 1024) {
                  setDataMessage('O arquivo excede o limite de 50 MB.')
                  return
                }
                setDataBusy(true)
                setDataMessage(null)
                void file
                  .text()
                  .then((serialized) => {
                    const summary = onInspectBackup(serialized)
                    setPendingRestore({ serialized, summary })
                  })
                  .catch((error: unknown) => {
                    setDataMessage(
                      error instanceof Error
                        ? error.message
                        : 'Não foi possível ler este backup.',
                    )
                  })
                  .finally(() => setDataBusy(false))
              }}
            />

            <button
              type="button"
              className="data-row danger-row"
              disabled={dataBusy}
              onClick={() => {
                setPendingRestore(null)
                setDataMessage(null)
                setClearPending(true)
              }}
            >
              <span>
                <strong>Apagar dados</strong>
                <small>Remove partidas, arquivo, prática e ajustes locais.</small>
              </span>
            </button>
          </div>

          {pendingRestore && (
            <div className="data-confirmation" role="group" aria-label="Confirmar restauração">
              <p>{describeBackup(pendingRestore.summary)}</p>
              <div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={dataBusy}
                  onClick={() => {
                    setDataBusy(true)
                    setDataMessage(null)
                    void onRestoreData(pendingRestore.serialized)
                      .then((result) => {
                        setPendingRestore(null)
                        setClearPending(false)
                        setDataMessage(
                          `Backup restaurado · ${describeBackup(result)}`,
                        )
                      })
                      .catch((error: unknown) => {
                        setDataMessage(
                          error instanceof Error
                            ? error.message
                            : 'Não foi possível restaurar o backup.',
                        )
                      })
                      .finally(() => setDataBusy(false))
                  }}
                >
                  Restaurar este backup
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setPendingRestore(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {clearPending && (
            <div className="data-confirmation" role="group" aria-label="Confirmar exclusão">
              <p>Esta ação remove todos os dados locais e não pode ser desfeita sem um backup.</p>
              <div>
                <button
                  type="button"
                  className="secondary-action danger-action"
                  disabled={dataBusy}
                  onClick={() => {
                    setDataBusy(true)
                    void onClearData().finally(() => setDataBusy(false))
                  }}
                >
                  Apagar definitivamente
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setClearPending(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {dataMessage && (
            <p className="data-message" role="status">
              {dataMessage}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
