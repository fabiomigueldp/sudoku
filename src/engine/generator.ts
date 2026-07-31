import type {
  DifficultyId,
  PuzzleDefinition,
  VariantId,
} from '../domain/types'
import {
  analyzeDifficulty,
  LOGICAL_TECHNIQUE_RANK,
  type DifficultyAnalysis,
  type DifficultyTechnique,
} from './analyzer'
import { createSeededRandom, hashSeed } from './random'
import { countSolutions, solve } from './solver'
import { CELL_COUNT } from './topology'

export interface DifficultyProfile {
  readonly targetClues: number
  readonly clueRange: readonly [minimum: number, maximum: number]
  readonly technique: string
}

export const DIFFICULTY_PROFILES: Readonly<Record<DifficultyId, DifficultyProfile>> = {
  relaxed: {
    targetClues: 46,
    clueRange: [44, 49],
    technique: 'naked-single',
  },
  focused: {
    targetClues: 39,
    clueRange: [37, 43],
    technique: 'hidden-single',
  },
  challenging: {
    targetClues: 34,
    clueRange: [32, 37],
    technique: 'locked-candidates-pointing',
  },
  expert: {
    targetClues: 29,
    clueRange: [27, 32],
    technique: 'naked-pair',
  },
  master: {
    targetClues: 25,
    clueRange: [22, 28],
    technique: 'x-wing',
  },
}

export interface GeneratePuzzleOptions {
  seed: string
  variant?: VariantId
  difficulty?: DifficultyId
  /**
   * Defaults to 0 so equal inputs produce deeply equal definitions. Callers
   * that persist an ad-hoc generation time can provide it explicitly.
   */
  generatedAt?: number
}

export interface GeneratorRequest {
  id: string
  seed: string
  variant: VariantId
  difficulty: DifficultyId
  generatedAt?: number
}

export interface GeneratorSuccess {
  id: string
  ok: true
  puzzle: PuzzleDefinition
}

export interface GeneratorFailure {
  id: string
  ok: false
  error: string
}

export type GeneratorResponse = GeneratorSuccess | GeneratorFailure

const DIFFICULTIES: readonly DifficultyId[] = [
  'relaxed',
  'focused',
  'challenging',
  'expert',
  'master',
]
const VARIANTS: readonly VariantId[] = ['classic', 'diagonal', 'anti-knight']

const TARGET_TECHNIQUE_RANK: Readonly<Record<DifficultyId, number>> = {
  relaxed: 1,
  focused: 2,
  challenging: 3,
  expert: 4,
  master: 5,
}

interface RatedCandidate {
  solution: number[]
  givens: number[]
  analysis: DifficultyAnalysis
  attempt: number
}

function difficultyTechniqueRank(technique: DifficultyTechnique): number {
  if (
    technique === 'none' ||
    technique === 'invalid'
  ) {
    return technique === 'none' ? 0 : 99
  }
  if (technique === 'search-required') return 6
  return LOGICAL_TECHNIQUE_RANK[technique]
}

function candidatePenalty(
  candidate: RatedCandidate,
  difficulty: DifficultyId,
): number {
  const desiredRank = TARGET_TECHNIQUE_RANK[difficulty]
  const actualRank = candidate.analysis.solvedLogically
    ? difficultyTechniqueRank(candidate.analysis.hardestTechnique)
    : 6
  const techniqueDistance =
    actualRank < desiredRank
      ? (desiredRank - actualRank) * 3
      : actualRank - desiredRank
  const clueDistance = Math.abs(
    clueCount(candidate.givens) - DIFFICULTY_PROFILES[difficulty].targetClues,
  )

  // Technique is the primary signal. Clue count only breaks ties between
  // candidates with similarly human-solvable paths.
  return techniqueDistance * 1_000 + clueDistance * 10 + candidate.attempt
}

function assertGenerationInput(
  seed: string,
  variant: VariantId,
  difficulty: DifficultyId,
  generatedAt: number,
): void {
  if (typeof seed !== 'string') throw new TypeError('Puzzle seed must be a string')
  if (!VARIANTS.includes(variant)) {
    throw new RangeError(`Unsupported Sudoku variant: ${String(variant)}`)
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new RangeError(`Unsupported difficulty: ${String(difficulty)}`)
  }
  if (!Number.isFinite(generatedAt) || generatedAt < 0) {
    throw new RangeError('generatedAt must be a non-negative finite timestamp')
  }
}

function clueCount(grid: readonly number[]): number {
  return grid.reduce((count, value) => count + (value === 0 ? 0 : 1), 0)
}

function rotationalGroups(): number[][] {
  const groups: number[][] = []

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const opposite = CELL_COUNT - 1 - index
    if (index > opposite) continue
    groups.push(index === opposite ? [index] : [index, opposite])
  }

  return groups
}

function tryRemove(
  givens: number[],
  cells: readonly number[],
  variant: VariantId,
  targetClues: number,
): boolean {
  const presentCells = cells.filter((cell) => givens[cell] !== 0)
  if (presentCells.length === 0) return false
  if (clueCount(givens) - presentCells.length < targetClues) return false

  const previous = presentCells.map((cell) => givens[cell] as number)
  for (const cell of presentCells) givens[cell] = 0

  if (countSolutions(givens, variant, 2) === 1) return true

  presentCells.forEach((cell, index) => {
    givens[cell] = previous[index] as number
  })
  return false
}

function carvePuzzle(
  solution: readonly number[],
  variant: VariantId,
  targetClues: number,
  random: ReturnType<typeof createSeededRandom>,
): number[] {
  const givens = [...solution]

  // Rotational symmetry gives the initial composition a calm visual balance.
  for (const group of random.shuffle(rotationalGroups())) {
    if (clueCount(givens) <= targetClues) break
    tryRemove(givens, group, variant, targetClues)
  }

  // A final single-cell pass reaches the profile more reliably when a
  // symmetrical pair was essential. Uniqueness is checked after every change.
  const remaining = givens
    .map((value, index) => (value === 0 ? -1 : index))
    .filter((index) => index >= 0)

  for (const cell of random.shuffle(remaining)) {
    if (clueCount(givens) <= targetClues) break
    tryRemove(givens, [cell], variant, targetClues)
  }

  return givens
}

function normalizeOptions(
  seedOrOptions: string | GeneratePuzzleOptions,
  variant: VariantId,
  difficulty: DifficultyId,
): Required<GeneratePuzzleOptions> {
  if (typeof seedOrOptions === 'string') {
    return {
      seed: seedOrOptions,
      variant,
      difficulty,
      generatedAt: 0,
    }
  }

  return {
    seed: seedOrOptions.seed,
    variant: seedOrOptions.variant ?? 'classic',
    difficulty: seedOrOptions.difficulty ?? 'focused',
    generatedAt: seedOrOptions.generatedAt ?? 0,
  }
}

export function generatePuzzle(
  seed: string,
  variant?: VariantId,
  difficulty?: DifficultyId,
): PuzzleDefinition
export function generatePuzzle(options: GeneratePuzzleOptions): PuzzleDefinition
export function generatePuzzle(
  seedOrOptions: string | GeneratePuzzleOptions,
  variant: VariantId = 'classic',
  difficulty: DifficultyId = 'focused',
): PuzzleDefinition {
  const options = normalizeOptions(seedOrOptions, variant, difficulty)
  assertGenerationInput(
    options.seed,
    options.variant,
    options.difficulty,
    options.generatedAt,
  )

  const profile = DIFFICULTY_PROFILES[options.difficulty]
  let bestCandidate: RatedCandidate | null = null

  // Rate a small deterministic candidate pool by the actual human solve path.
  // Three candidates preserves interactive generation speed while avoiding a
  // misleading clue-density-only label.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const random = createSeededRandom(
      `absolute-sudoku:generation:v2:${options.seed}:${options.variant}:${options.difficulty}:${attempt}`,
    )
    const solution = solve(new Array<number>(CELL_COUNT).fill(0), options.variant, {
      random,
    })

    if (solution === null) continue

    const minimumClues = profile.clueRange[0]
    const attemptTarget = Math.round(
      profile.targetClues -
        ((profile.targetClues - minimumClues) * attempt) / 2,
    )
    const givens = carvePuzzle(
      solution,
      options.variant,
      attemptTarget,
      random,
    )
    const candidate: RatedCandidate = {
      solution,
      givens,
      analysis: analyzeDifficulty(givens, options.variant),
      attempt,
    }

    if (
      bestCandidate === null ||
      candidatePenalty(candidate, options.difficulty) <
        candidatePenalty(bestCandidate, options.difficulty)
    ) {
      bestCandidate = candidate
    }
  }

  if (bestCandidate === null) {
    throw new Error(`Unable to generate a ${options.variant} Sudoku solution`)
  }

  const fingerprint = hashSeed(
    `${options.seed}|${options.variant}|${options.difficulty}|v2`,
  )
    .toString(16)
    .padStart(8, '0')

  return {
    id: `${options.variant}-${options.difficulty}-${fingerprint}`,
    seed: options.seed,
    variant: options.variant,
    difficulty: options.difficulty,
    givens: bestCandidate.givens,
    solution: bestCandidate.solution,
    technique: bestCandidate.analysis.hardestTechnique,
    generatedAt: options.generatedAt,
  }
}
