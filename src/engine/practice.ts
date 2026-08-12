import type {
  DifficultyId,
  Digit,
  PuzzleDefinition,
} from '../domain/types'
import type { LogicalTechnique } from './analyzer'
import { GENERATOR_VERSION } from './generator'
import {
  generatePuzzleInWorker,
  type WorkerGenerationOptions,
} from './generatorClient'
import { createSeededRandom, hashSeed } from './random'

export const PRACTICE_VERSION = 1 as const

export interface PracticeTechniqueDefinition {
  id: LogicalTechnique
  name: string
  family: 'fundamentos' | 'interações' | 'subconjuntos' | 'padrões'
  description: string
  difficulty: DifficultyId
  generationSeed: string
}

export const PRACTICE_TECHNIQUES: readonly PracticeTechniqueDefinition[] = [
  {
    id: 'naked-single',
    name: 'Single direto',
    family: 'fundamentos',
    description: 'Uma casa possui uma única possibilidade.',
    difficulty: 'relaxed',
    generationSeed: 'practice-audit:naked-single',
  },
  {
    id: 'hidden-single',
    name: 'Single oculto',
    family: 'fundamentos',
    description: 'Um dígito só pode ocupar uma casa da região.',
    difficulty: 'focused',
    generationSeed: 'practice-audit:hidden-single',
  },
  {
    id: 'locked-candidates-pointing',
    name: 'Candidatos apontados',
    family: 'interações',
    description: 'Um bloco restringe um dígito a uma linha ou coluna.',
    difficulty: 'challenging',
    generationSeed: 'practice-audit:locked-candidates-pointing',
  },
  {
    id: 'locked-candidates-claiming',
    name: 'Candidatos confinados',
    family: 'interações',
    description: 'Uma linha ou coluna confina o dígito a um bloco.',
    difficulty: 'challenging',
    generationSeed: 'practice-audit:locked-candidates-claiming',
  },
  {
    id: 'naked-pair',
    name: 'Par nu',
    family: 'subconjuntos',
    description: 'Duas casas reservam o mesmo par de candidatos.',
    difficulty: 'challenging',
    generationSeed: 'practice-audit:naked-pair',
  },
  {
    id: 'hidden-pair',
    name: 'Par oculto',
    family: 'subconjuntos',
    description: 'Dois dígitos ficam restritos às mesmas duas casas.',
    difficulty: 'challenging',
    generationSeed: 'practice-audit:hidden-pair',
  },
  {
    id: 'naked-triple',
    name: 'Trinca nua',
    family: 'subconjuntos',
    description: 'Três casas reservam somente três candidatos.',
    difficulty: 'expert',
    generationSeed: 'practice-audit:naked-triple',
  },
  {
    id: 'x-wing',
    name: 'X-Wing',
    family: 'padrões',
    description: 'Duas linhas e duas colunas formam uma eliminação cruzada.',
    difficulty: 'expert',
    generationSeed: 'practice-audit:x-wing',
  },
  {
    id: 'skyscraper',
    name: 'Skyscraper',
    family: 'padrões',
    description: 'Duas ligações fortes compartilham uma cobertura comum.',
    difficulty: 'expert',
    generationSeed: 'practice-audit:skyscraper',
  },
  {
    id: 'xy-wing',
    name: 'XY-Wing',
    family: 'padrões',
    description: 'Três pares conectados eliminam um candidato em comum.',
    difficulty: 'master',
    generationSeed: 'practice-audit:xy-wing',
  },
] as const

export function practiceTechniqueDefinition(
  technique: LogicalTechnique,
): PracticeTechniqueDefinition | null {
  return PRACTICE_TECHNIQUES.find((entry) => entry.id === technique) ?? null
}

export function practiceSessionSeed(
  technique: LogicalTechnique,
  entropy: string,
): string {
  return `absolute-sudoku:practice:v${PRACTICE_VERSION}:g${GENERATOR_VERSION}:${technique}:${hashSeed(entropy).toString(16).padStart(8, '0')}`
}

interface PracticeTransform {
  symmetry: number
  digitOrder: number[]
}

function sourceCoordinate(
  row: number,
  column: number,
  symmetry: number,
): readonly [row: number, column: number] {
  if (symmetry === 1) return [column, 8 - row]
  if (symmetry === 2) return [8 - row, 8 - column]
  if (symmetry === 3) return [8 - column, row]
  if (symmetry === 4) return [row, 8 - column]
  if (symmetry === 5) return [8 - row, column]
  if (symmetry === 6) return [column, row]
  if (symmetry === 7) return [8 - column, 8 - row]
  return [row, column]
}

function transformedGrid(
  grid: readonly number[],
  transform: PracticeTransform,
): number[] {
  const mapped: number[] = new Array(81).fill(0)

  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const [sourceRow, sourceColumn] = sourceCoordinate(
        row,
        column,
        transform.symmetry,
      )
      const value = grid[sourceRow * 9 + sourceColumn] as number
      mapped[row * 9 + column] =
        value === 0 ? 0 : (transform.digitOrder[value - 1] as Digit)
    }
  }
  return mapped
}

export function transformPracticePuzzle(
  base: PuzzleDefinition,
  technique: LogicalTechnique,
  sessionSeed: string,
  generatedAt: number,
): PuzzleDefinition {
  const random = createSeededRandom(`practice-transform:${sessionSeed}`)
  const transform: PracticeTransform = {
    symmetry: random.integer(8),
    digitOrder: random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  }
  const fingerprint = hashSeed(
    `${sessionSeed}:${technique}:g${GENERATOR_VERSION}`,
  )
    .toString(16)
    .padStart(8, '0')
  return {
    ...base,
    id: `practice-${technique}-${fingerprint}`,
    seed: practiceSessionSeed(technique, sessionSeed),
    givens: transformedGrid(base.givens, transform),
    solution: transformedGrid(base.solution, transform),
    generatedAt,
  }
}

export async function generatePracticePuzzleInWorker(
  technique: LogicalTechnique,
  sessionSeed: string,
  options: WorkerGenerationOptions = {},
): Promise<PuzzleDefinition> {
  const definition = practiceTechniqueDefinition(technique)
  if (definition === null) {
    throw new RangeError(`Unsupported practice technique: ${technique}`)
  }
  const base = await generatePuzzleInWorker(
    definition.generationSeed,
    'classic',
    definition.difficulty,
    {
      ...options,
      targetTechnique: technique,
      generatedAt: 0,
    },
  )
  return transformPracticePuzzle(
    base,
    technique,
    sessionSeed,
    options.generatedAt ?? Date.now(),
  )
}
