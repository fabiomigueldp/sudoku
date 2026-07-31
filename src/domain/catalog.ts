import type {
  DifficultyId,
  GameSettings,
  PlayerStats,
  VariantId,
} from './types'

export const VARIANTS: ReadonlyArray<{
  id: VariantId
  name: string
  shortName: string
  description: string
}> = [
  {
    id: 'classic',
    name: 'Clássico',
    shortName: 'Clássico',
    description: 'Linhas, colunas e blocos 3×3 contêm 1–9.',
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    shortName: 'Diagonal',
    description: 'As duas diagonais também contêm 1–9.',
  },
  {
    id: 'anti-knight',
    name: 'Anti-cavalo',
    shortName: 'Anti-cavalo',
    description: 'Dígitos iguais não podem estar a um salto de cavalo.',
  },
]

export const DIFFICULTIES: ReadonlyArray<{
  id: DifficultyId
  name: string
  description: string
}> = [
  { id: 'relaxed', name: 'Sereno', description: 'Singles e leitura direta.' },
  { id: 'focused', name: 'Focado', description: 'Singles ocultos e interações simples.' },
  {
    id: 'challenging',
    name: 'Desafiador',
    description: 'Pares, candidatos bloqueados e mais trabalho.',
  },
  {
    id: 'expert',
    name: 'Especialista',
    description: 'Técnicas avançadas e poucas concessões.',
  },
  {
    id: 'master',
    name: 'Mestre',
    description: 'Grades densas para raciocínio prolongado.',
  },
]

export const DEFAULT_SETTINGS: GameSettings = {
  theme: 'system',
  errorPolicy: 'conflicts',
  highlightPeers: true,
  highlightMatches: true,
  highlightCandidates: true,
  autoRemoveCandidates: true,
  autoCandidates: false,
  showRemaining: true,
  showTimer: true,
  reduceMotion: false,
  highContrast: false,
  sound: true,
  haptics: true,
}

export const EMPTY_STATS: PlayerStats = {
  completed: 0,
  cleanSolves: 0,
  totalTimeMs: 0,
  currentDailyStreak: 0,
  lastDailyDate: null,
  records: [],
}
