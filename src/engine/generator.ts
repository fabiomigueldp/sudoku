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
  type LogicalTechnique,
} from './analyzer'
import { createSeededRandom, hashSeed } from './random'
import { countSolutions, solve } from './solver'
import { CELL_COUNT } from './topology'

export const GENERATOR_VERSION = 3

export interface DifficultyProfile {
  readonly targetClues: number
  readonly clueRange: readonly [minimum: number, maximum: number]
  readonly technique: string
  readonly rankRange: readonly [minimum: number, maximum: number]
  readonly targetRank: number
  readonly attempts: number
}

export const DIFFICULTY_PROFILES: Readonly<Record<DifficultyId, DifficultyProfile>> = {
  relaxed: {
    targetClues: 46,
    clueRange: [44, 49],
    technique: 'naked-single',
    rankRange: [1, 1],
    targetRank: 1,
    attempts: 4,
  },
  focused: {
    targetClues: 40,
    clueRange: [37, 43],
    technique: 'hidden-single',
    rankRange: [1, 3],
    targetRank: 2,
    attempts: 12,
  },
  challenging: {
    targetClues: 35,
    clueRange: [30, 45],
    technique: 'locked-candidates-pointing',
    rankRange: [3, 5],
    targetRank: 3,
    attempts: 56,
  },
  expert: {
    targetClues: 32,
    clueRange: [26, 42],
    technique: 'naked-triple',
    rankRange: [5, 6],
    targetRank: 6,
    attempts: 56,
  },
  master: {
    targetClues: 29,
    clueRange: [22, 40],
    technique: 'swordfish',
    rankRange: [6, 8],
    targetRank: 7,
    attempts: 64,
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
  /** Restricts practice generation to paths containing a named technique. */
  targetTechnique?: LogicalTechnique
}

export interface GeneratorRequest {
  id: string
  seed: string
  variant: VariantId
  difficulty: DifficultyId
  generatedAt?: number
  targetTechnique?: LogicalTechnique
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
  if (technique === 'search-required') return 99
  return LOGICAL_TECHNIQUE_RANK[technique]
}

function candidatePenalty(
  candidate: RatedCandidate,
  difficulty: DifficultyId,
  targetTechnique?: LogicalTechnique,
): number {
  const desiredRank = targetTechnique === undefined
    ? DIFFICULTY_PROFILES[difficulty].targetRank
    : LOGICAL_TECHNIQUE_RANK[targetTechnique]
  const actualRank = candidate.analysis.solvedLogically
    ? difficultyTechniqueRank(candidate.analysis.hardestTechnique)
    : 99
  const techniqueDistance =
    actualRank < desiredRank
      ? (desiredRank - actualRank) * 3
      : actualRank - desiredRank
  const clueDistance = Math.abs(
    clueCount(candidate.givens) - DIFFICULTY_PROFILES[difficulty].targetClues,
  )

  // Technique is the primary signal. Clue count only breaks ties between
  // candidates with similarly human-solvable paths.
  const workDistance = Math.abs(
    candidate.analysis.steps.length -
      Math.max(1, 81 - DIFFICULTY_PROFILES[difficulty].targetClues),
  )
  return (
    techniqueDistance * 1_000 +
    clueDistance * 10 +
    workDistance +
    candidate.attempt
  )
}

function candidateMatchesProfile(
  candidate: RatedCandidate,
  difficulty: DifficultyId,
  targetTechnique?: LogicalTechnique,
): boolean {
  if (!candidate.analysis.solvedLogically) return false
  const profile = DIFFICULTY_PROFILES[difficulty]
  const rank = difficultyTechniqueRank(candidate.analysis.hardestTechnique)
  const clues = clueCount(candidate.givens)
  return (
    (targetTechnique === undefined ||
      candidate.analysis.steps.some(
        (step) => step.technique === targetTechnique,
      )) &&
    rank >= profile.rankRange[0] &&
    rank <= profile.rankRange[1] &&
    clues >= profile.clueRange[0] &&
    clues <= profile.clueRange[1]
  )
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

function carveRatedPuzzle(
  solution: readonly number[],
  variant: VariantId,
  difficulty: DifficultyId,
  random: ReturnType<typeof createSeededRandom>,
  attempt: number,
  targetTechnique?: LogicalTechnique,
): RatedCandidate | null {
  const profile = DIFFICULTY_PROFILES[difficulty]
  const givens = [...solution]
  let best: RatedCandidate | null = null

  // Every accepted removal preserves uniqueness, human solvability and full
  // rotational symmetry. Difficulty is observed during carving, rather than
  // guessed later from clue density.
  for (const group of random.shuffle(rotationalGroups())) {
    const presentCells = group.filter((cell) => givens[cell] !== 0)
    if (presentCells.length === 0) continue
    if (
      clueCount(givens) - presentCells.length < profile.clueRange[0]
    ) {
      continue
    }

    const previous = presentCells.map((cell) => givens[cell] as number)
    for (const cell of presentCells) givens[cell] = 0

    const unique = countSolutions(givens, variant, 2) === 1
    const analysis = unique
      ? analyzeDifficulty(givens, variant)
      : null
    const rank =
      analysis === null
        ? 99
        : difficultyTechniqueRank(analysis.hardestTechnique)
    const withinCeiling =
      analysis?.solvedLogically === true && rank <= profile.rankRange[1]

    if (!unique || !withinCeiling) {
      presentCells.forEach((cell, index) => {
        givens[cell] = previous[index] as number
      })
      continue
    }

    const candidate: RatedCandidate = {
      solution: [...solution],
      givens: [...givens],
      analysis,
      attempt,
    }
    if (
      candidateMatchesProfile(candidate, difficulty, targetTechnique) &&
      (best === null ||
        candidatePenalty(candidate, difficulty, targetTechnique) <
          candidatePenalty(best, difficulty, targetTechnique))
    ) {
      best = candidate
    }

    if (
      best !== null &&
      clueCount(givens) <= profile.targetClues
    ) {
      break
    }
  }

  return best
}

interface NormalizedGeneratePuzzleOptions {
  seed: string
  variant: VariantId
  difficulty: DifficultyId
  generatedAt: number
  targetTechnique?: LogicalTechnique
}

function normalizeOptions(
  seedOrOptions: string | GeneratePuzzleOptions,
  variant: VariantId,
  difficulty: DifficultyId,
): NormalizedGeneratePuzzleOptions {
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
    ...(seedOrOptions.targetTechnique === undefined
      ? {}
      : { targetTechnique: seedOrOptions.targetTechnique }),
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

  let bestCandidate: RatedCandidate | null = null
  let preferredCandidates = 0

  const profile = DIFFICULTY_PROFILES[options.difficulty]
  const attemptLimit = options.targetTechnique === undefined
    ? profile.attempts
    : profile.attempts * 2
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const random = createSeededRandom(
      `absolute-sudoku:generation:v${GENERATOR_VERSION}:${options.seed}:${options.variant}:${options.difficulty}:${attempt}`,
    )
    const solution = solve(new Array<number>(CELL_COUNT).fill(0), options.variant, {
      random,
    })

    if (solution === null) continue

    const candidate = carveRatedPuzzle(
      solution,
      options.variant,
      options.difficulty,
      random,
      attempt,
      options.targetTechnique,
    )
    if (candidate === null) continue
    const candidateRank = difficultyTechniqueRank(
      candidate.analysis.hardestTechnique,
    )
    if (
      options.targetTechnique === undefined
        ? candidateRank >= profile.targetRank
        : candidate.analysis.steps.some(
            (step) => step.technique === options.targetTechnique,
          )
    ) {
      preferredCandidates += 1
    }

    if (
      bestCandidate === null ||
        candidatePenalty(
          candidate,
          options.difficulty,
          options.targetTechnique,
        ) <
        candidatePenalty(
          bestCandidate,
          options.difficulty,
          options.targetTechnique,
        )
    ) {
      bestCandidate = candidate
    }

    if (
      preferredCandidates >=
      (options.targetTechnique === undefined ? 2 : 1)
    ) {
      break
    }
  }

  if (bestCandidate === null) {
    throw new Error(
      `Unable to generate a logically rated ${options.targetTechnique ?? options.difficulty} ${options.variant} Sudoku`,
    )
  }

  const fingerprintSource =
    options.targetTechnique === undefined
      ? `${options.seed}|${options.variant}|${options.difficulty}|v${GENERATOR_VERSION}`
      : `${options.seed}|${options.variant}|${options.difficulty}|${options.targetTechnique}|v${GENERATOR_VERSION}`
  const fingerprint = hashSeed(fingerprintSource)
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
