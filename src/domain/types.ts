export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type VariantId = 'classic' | 'diagonal' | 'anti-knight'

export type DifficultyId =
  | 'relaxed'
  | 'focused'
  | 'challenging'
  | 'expert'
  | 'master'

export type InputMode = 'value' | 'corner' | 'center' | 'color'

export type CellColor = 'sage' | 'sky' | 'sand' | 'rose'

export type ErrorPolicy = 'conflicts' | 'solution' | 'on-demand' | 'completion'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface PuzzleDefinition {
  id: string
  seed: string
  variant: VariantId
  difficulty: DifficultyId
  givens: number[]
  solution: number[]
  technique: string
  generatedAt: number
}

export interface CellState {
  value: Digit | null
  given: boolean
  corner: Digit[]
  center: Digit[]
  color: CellColor | null
}

export interface GameSnapshot {
  cells: CellState[]
  elapsedMs: number
  mistakes: number
  hintsUsed: number
}

export interface HintStep {
  technique: string
  title: string
  explanation: string
  cells: number[]
  digit?: Digit
  phase: 1 | 2 | 3 | 4
}

export type GameStatus = 'playing' | 'paused' | 'completed'

export interface GameState {
  puzzle: PuzzleDefinition
  cells: CellState[]
  selected: number[]
  anchor: number
  activeDigit: Digit | null
  inputMode: InputMode
  history: GameSnapshot[]
  future: GameSnapshot[]
  elapsedMs: number
  lastResumedAt: number | null
  mistakes: number
  hintsUsed: number
  hint: HintStep | null
  status: GameStatus
  completedAt: number | null
}

export interface GameSettings {
  theme: ThemePreference
  errorPolicy: ErrorPolicy
  highlightPeers: boolean
  highlightMatches: boolean
  highlightCandidates: boolean
  autoRemoveCandidates: boolean
  autoCandidates: boolean
  showRemaining: boolean
  showTimer: boolean
  reduceMotion: boolean
  highContrast: boolean
  sound: boolean
  haptics: boolean
}

export interface GameRecord {
  id: string
  puzzleId: string
  variant: VariantId
  difficulty: DifficultyId
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  completedAt: number
}

export interface PlayerStats {
  completed: number
  cleanSolves: number
  totalTimeMs: number
  currentDailyStreak: number
  lastDailyDate: string | null
  records: GameRecord[]
}
