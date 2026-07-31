import type {
  CellColor,
  DifficultyId,
  Digit,
  GameSettings,
  PlayerStats,
  VariantId,
} from './types'

export const CELL_COLOR_LABELS: Readonly<Record<CellColor, string>> = {
  sage: 'Verde sálvia',
  sky: 'Azul céu',
  sand: 'Areia',
  rose: 'Rosa',
}

export const CELL_COLORS: ReadonlyArray<{
  id: CellColor
  label: string
  shortcut: Digit
}> = [
  { id: 'sage', label: CELL_COLOR_LABELS.sage, shortcut: 1 },
  { id: 'sky', label: CELL_COLOR_LABELS.sky, shortcut: 2 },
  { id: 'sand', label: CELL_COLOR_LABELS.sand, shortcut: 3 },
  { id: 'rose', label: CELL_COLOR_LABELS.rose, shortcut: 4 },
]

export const DIGIT_COLOR_MAP: Readonly<Partial<Record<Digit, CellColor>>> = {
  1: 'sage',
  2: 'sky',
  3: 'sand',
  4: 'rose',
}

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
