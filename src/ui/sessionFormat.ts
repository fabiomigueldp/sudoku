import { DIFFICULTIES, VARIANTS } from '../domain/catalog'
import { practiceTechniqueDefinition } from '../engine'
import type { SavedGameSummary } from '../game'

export function sessionLabel(session: SavedGameSummary): string {
  if (session.practiceTechnique !== null) {
    return `Prática · ${practiceTechniqueDefinition(session.practiceTechnique)?.name ?? session.practiceTechnique}`
  }
  const variant = VARIANTS.find((item) => item.id === session.variant)?.name
  const difficulty = DIFFICULTIES.find((item) => item.id === session.difficulty)?.name
  return `${variant} · ${difficulty}`
}

export function savedDateLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const day = date.toDateString() === today.toDateString()
    ? 'Hoje'
    : date.toDateString() === yesterday.toDateString()
      ? 'Ontem'
      : new Intl.DateTimeFormat('pt-BR', {
          day: 'numeric', month: 'short',
          ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
        }).format(date)
  return `${day}, ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)}`
}

export function sessionContext(session: SavedGameSummary): string | null {
  if (session.kind !== 'daily') return null
  const day = session.seed.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  return day
    ? `Diário · ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`))}`
    : 'Desafio diário'
}
