export {
  ALL_DIGITS,
  BOX_SIDE,
  CELL_COUNT,
  GRID_SIDE,
  boxOf,
  candidateMap,
  candidateMap as getCandidateMap,
  candidatesFor,
  candidatesFor as getCandidates,
  cellConflicts,
  cellConflicts as getCellConflicts,
  columnOf,
  conflictingCells,
  conflictingCells as findConflicts,
  isPlacementValid,
  isPlacementValid as isValidPlacement,
  isSolved,
  isValidGrid,
  isValidGrid as isValidBoard,
  peersFor,
  peersFor as getPeers,
  rowOf,
  unitsFor,
  unitsForCell,
} from './topology'

export {
  analyzeSolutions,
  countSolutions,
  hasUniqueSolution,
  solutionMatches,
  solve,
  type SolutionAnalysis,
  type SolveOptions,
} from './solver'

export {
  LOGICAL_TECHNIQUE_RANK,
  analyzeDifficulty,
  findNextLogicalStep,
  solveLogically,
  type DifficultyAnalysis,
  type DifficultyTechnique,
  type LogicalElimination,
  type LogicalPlacement,
  type LogicalSolveResult,
  type LogicalStep,
  type LogicalTechnique,
} from './analyzer'

export {
  DIFFICULTY_PROFILES,
  GENERATOR_VERSION,
  generatePuzzle,
  type DifficultyProfile,
  type GeneratePuzzleOptions,
  type GeneratorFailure,
  type GeneratorRequest,
  type GeneratorResponse,
  type GeneratorSuccess,
} from './generator'

export {
  generatePuzzleInWorker,
  type WorkerGenerationOptions,
} from './generatorClient'

export { DAILY_SCHEDULE, dailyProfile, dailySeed, localDateKey, matchesDailySeed } from './daily'
export { findHint } from './hints'
export {
  PRACTICE_TECHNIQUES,
  PRACTICE_VERSION,
  generatePracticePuzzleInWorker,
  practiceSessionSeed,
  practiceTechniqueDefinition,
  transformPracticePuzzle,
  type PracticeTechniqueDefinition,
} from './practice'
export {
  createSeededRandom,
  hashSeed,
  type SeededRandom,
} from './random'
