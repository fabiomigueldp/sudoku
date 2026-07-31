import type {
  CellState,
  Digit,
  HintStep,
  PuzzleDefinition,
  VariantId,
} from '../domain/types'
import { solveLogically, type LogicalStep } from './analyzer'
import { countSolutions, solve, solutionMatches } from './solver'
import {
  ALL_DIGITS,
  assertGrid,
  candidateMap,
  candidatesFor,
  conflictingCells,
  isSolved,
  unitsFor,
  unitsForCell,
} from './topology'

type HintPhase = HintStep['phase']

interface HintMove {
  technique: string
  title: string
  target: number
  context: number[]
  digit?: Digit
  explanations: readonly [string, string, string, string]
}

function assertPhase(phase: number): asserts phase is HintPhase {
  if (!Number.isInteger(phase) || phase < 1 || phase > 4) {
    throw new RangeError('Hint phase must be 1, 2, 3, or 4')
  }
}

function gridFromCells(cells: readonly CellState[]): number[] {
  const grid = cells.map((cell) => cell.value ?? 0)
  assertGrid(grid)
  return grid
}

function uniqueCells(cells: readonly number[]): number[] {
  return [...new Set(cells)].sort((left, right) => left - right)
}

function presentMove(move: HintMove, phase: HintPhase): HintStep {
  const cells =
    phase === 1
      ? [move.target]
      : phase === 2 || phase === 3
        ? uniqueCells([move.target, ...move.context])
        : [move.target]

  const base: HintStep = {
    technique: move.technique,
    title: move.title,
    explanation: move.explanations[phase - 1] as string,
    cells,
    phase,
  }

  if (move.digit !== undefined && phase >= 3) {
    return { ...base, digit: move.digit }
  }

  return base
}

function conflictMove(conflicts: readonly number[]): HintMove {
  const target = conflicts[0] as number
  return {
    technique: 'conflict',
    title: 'Há uma contradição',
    target,
    context: [...conflicts],
    explanations: [
      'Antes do próximo passo, observe a casa destacada.',
      'O mesmo dígito aparece em casas que não podem ser iguais.',
      'Resolva o conflito destacado para recuperar uma grade válida.',
      'Apague ou corrija um dos valores conflitantes antes de continuar.',
    ],
  }
}

function incorrectValueMove(
  index: number,
  expectedDigit: Digit,
): HintMove {
  return {
    technique: 'incorrect-value',
    title: 'Revise esta casa',
    target: index,
    context: [],
    digit: expectedDigit,
    explanations: [
      'Uma escolha anterior impede a continuação correta.',
      'Revise o valor da casa destacada.',
      `A continuação consistente precisa do ${expectedDigit} nesta casa.`,
      `Troque o valor desta casa por ${expectedDigit}.`,
    ],
  }
}

function nakedSingleMove(
  grid: readonly number[],
  variant: VariantId,
): HintMove | null {
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] !== 0) continue

    const candidates = candidatesFor(grid, index, variant)
    if (candidates.length !== 1) continue

    const digit = candidates[0] as Digit
    const context =
      unitsForCell(index, variant)
        .map((unit) => unit.filter((cell) => grid[cell] !== 0))
        .sort((left, right) => right.length - left.length)[0] ?? []

    return {
      technique: 'naked-single',
      title: 'Único candidato',
      target: index,
      context: [...context],
      digit,
      explanations: [
        'Há uma casa que aceita apenas um candidato.',
        'Os valores já presentes nas casas relacionadas eliminam oito dígitos.',
        `Só o ${digit} permanece possível na casa destacada.`,
        `Coloque ${digit} na casa destacada.`,
      ],
    }
  }

  return null
}

function hiddenSingleMove(
  grid: readonly number[],
  variant: VariantId,
): HintMove | null {
  const candidates = candidateMap(grid, variant)

  for (const unit of unitsFor(variant)) {
    for (const digit of ALL_DIGITS) {
      if (unit.some((cell) => grid[cell] === digit)) continue

      const possibleCells = unit.filter(
        (cell) => grid[cell] === 0 && (candidates[cell] as Digit[]).includes(digit),
      )

      if (possibleCells.length !== 1) continue

      const target = possibleCells[0] as number
      return {
        technique: 'hidden-single',
        title: 'Único lugar',
        target,
        context: [...unit],
        digit,
        explanations: [
          'Um dígito tem apenas um lugar possível em uma região.',
          'Compare os candidatos nas casas destacadas.',
          `Nesta região, o ${digit} só pode ocupar a casa indicada.`,
          `Coloque ${digit} na casa destacada.`,
        ],
      }
    }
  }

  return null
}

function techniqueTitle(technique: LogicalStep['technique']): string {
  switch (technique) {
    case 'locked-candidates-pointing':
      return 'Candidatos apontados'
    case 'locked-candidates-claiming':
      return 'Candidatos confinados'
    case 'naked-pair':
      return 'Par nu'
    case 'x-wing':
      return 'X-Wing'
    case 'hidden-single':
      return 'Único lugar'
    case 'naked-single':
      return 'Único candidato'
  }
}

function advancedLogicalMove(
  grid: readonly number[],
  variant: VariantId,
): HintMove | null {
  const logical = solveLogically(grid, variant)
  const first = logical.steps[0]
  if (
    first === undefined ||
    first.action !== 'eliminate' ||
    (first.technique !== 'locked-candidates-pointing' &&
      first.technique !== 'locked-candidates-claiming' &&
      first.technique !== 'naked-pair' &&
      first.technique !== 'x-wing')
  ) {
    return null
  }

  // Candidate eliminations are explained as the reason for the next forced
  // placement. The app can therefore apply phase four safely as a value move,
  // while the reasoning remains a genuine human deduction rather than a peek
  // at the stored solution.
  const placementStep = logical.steps
    .slice(1)
    .find((step) => step.placements.length > 0)
  const placement = placementStep?.placements[0]
  if (placement === undefined) return null

  const eliminatedDigits = first.digits.join(' e ')
  const affectedCount = first.affectedCells.length
  const patternName =
    first.technique === 'naked-pair'
      ? `O par ${eliminatedDigits}`
      : first.technique === 'x-wing'
        ? `O X-Wing de ${eliminatedDigits}`
        : `O ${eliminatedDigits} confinado`
  const context = uniqueCells([
    ...first.cells,
    ...first.affectedCells,
    ...first.units.flat(),
  ])

  return {
    technique: first.technique,
    title: techniqueTitle(first.technique),
    target: placement.cell,
    context,
    digit: placement.digit,
    explanations: [
      'Há um padrão de candidatos que libera o próximo passo lógico.',
      `Compare as casas do padrão com as ${affectedCount} casas alcançadas por ele.`,
      `${patternName} elimina candidatos dessas casas e força a continuação.`,
      `Depois dessas eliminações, coloque ${placement.digit} na casa destacada.`,
    ],
  }
}

function guidedMove(
  grid: readonly number[],
  variant: VariantId,
  solution: readonly number[],
  unique: boolean,
): HintMove | null {
  let target = -1
  let targetCandidates: Digit[] = []

  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] !== 0) continue
    const candidates = candidatesFor(grid, index, variant)

    if (
      candidates.length > 0 &&
      (target === -1 || candidates.length < targetCandidates.length)
    ) {
      target = index
      targetCandidates = candidates
    }
  }

  if (target === -1) return null

  const digit = solution[target] as Digit
  const context = uniqueCells(unitsForCell(target, variant).flatMap((unit) => unit))
  const alternatives = targetCandidates.filter((candidate) => candidate !== digit)
  const alternativeText =
    alternatives.length === 1
      ? `a alternativa ${alternatives[0]}`
      : `as alternativas ${alternatives.join(', ')}`

  return {
    technique: unique ? 'forcing-choice' : 'guided-continuation',
    title: unique ? 'Teste por contradição' : 'Continuação guiada',
    target,
    context,
    digit,
    explanations: [
      'Os singles se esgotaram; escolha uma casa com poucos candidatos.',
      'Acompanhe as consequências de cada candidato nas regiões destacadas.',
      !unique
        ? `Uma continuação válida usa ${digit} nesta casa.`
        : alternatives.length === 0
          ? `A continuação consistente fixa ${digit} nesta casa.`
          : `Ao avançar, ${alternativeText} leva a uma contradição; resta ${digit}.`,
      `Coloque ${digit} na casa destacada e continue a dedução.`,
    ],
  }
}

function computeHint(
  grid: readonly number[],
  variant: VariantId,
  suppliedSolution: readonly number[] | undefined,
  phase: HintPhase,
): HintStep | null {
  assertGrid(grid)

  const conflicts = conflictingCells(grid, variant)
  if (conflicts.length > 0) return presentMove(conflictMove(conflicts), phase)
  if (isSolved(grid, variant)) return null

  if (suppliedSolution !== undefined) {
    assertGrid(suppliedSolution)

    if (isSolved(suppliedSolution, variant)) {
      const incorrectIndex = grid.findIndex(
        (value, index) => value !== 0 && value !== suppliedSolution[index],
      )

      if (incorrectIndex >= 0) {
        return presentMove(
          incorrectValueMove(
            incorrectIndex,
            suppliedSolution[incorrectIndex] as Digit,
          ),
          phase,
        )
      }
    }
  }

  const nakedSingle = nakedSingleMove(grid, variant)
  if (nakedSingle !== null) return presentMove(nakedSingle, phase)

  const hiddenSingle = hiddenSingleMove(grid, variant)
  if (hiddenSingle !== null) return presentMove(hiddenSingle, phase)

  const advanced = advancedLogicalMove(grid, variant)
  if (advanced !== null) return presentMove(advanced, phase)

  const solution =
    suppliedSolution !== undefined &&
    solutionMatches(grid, suppliedSolution, variant)
      ? [...suppliedSolution]
      : solve(grid, variant)

  if (solution === null) {
    const empty = grid.findIndex((value) => value === 0)
    if (empty < 0) return null

    return presentMove(
      {
        technique: 'contradiction',
        title: 'Revise a grade',
        target: empty,
        context: [],
        explanations: [
          'A grade atual não admite uma solução.',
          'Revise as escolhas feitas antes desta casa.',
          'Ao menos um valor anterior precisa ser corrigido.',
          'Desfaça a última escolha incerta e tente outra continuação.',
        ],
      },
      phase,
    )
  }

  const fallback = guidedMove(
    grid,
    variant,
    solution,
    countSolutions(grid, variant, 2) === 1,
  )
  return fallback === null ? null : presentMove(fallback, phase)
}

export function findHint(
  cells: readonly CellState[],
  puzzle: PuzzleDefinition,
  phase?: HintPhase,
): HintStep | null
export function findHint(
  grid: readonly number[],
  variant: VariantId,
  solution?: readonly number[],
  phase?: HintPhase,
): HintStep | null
export function findHint(
  cellsOrGrid: readonly CellState[] | readonly number[],
  puzzleOrVariant: PuzzleDefinition | VariantId,
  solutionOrPhase?: readonly number[] | HintPhase,
  requestedPhase?: HintPhase,
): HintStep | null {
  const isPuzzleCall = typeof puzzleOrVariant !== 'string'
  const phase = isPuzzleCall
    ? (solutionOrPhase as HintPhase | undefined) ?? 1
    : requestedPhase ?? 1
  assertPhase(phase)

  if (isPuzzleCall) {
    return computeHint(
      gridFromCells(cellsOrGrid as readonly CellState[]),
      puzzleOrVariant.variant,
      puzzleOrVariant.solution,
      phase,
    )
  }

  return computeHint(
    cellsOrGrid as readonly number[],
    puzzleOrVariant,
    Array.isArray(solutionOrPhase)
      ? (solutionOrPhase as readonly number[])
      : undefined,
    phase,
  )
}
