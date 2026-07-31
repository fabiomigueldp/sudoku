import type {
  CellColor,
  CellState,
  DifficultyId,
  Digit,
  GameSnapshot,
  GameState,
  HintStep,
  InputMode,
  PuzzleDefinition,
  VariantId,
} from '../domain/types'
import {
  analyzeSolutions,
  conflictingCells,
  hashSeed,
  isSolved,
} from '../engine'
import { migrateSession } from './persistence'
import { assertPuzzleDefinition, BOARD_SIZE } from './state'

export const GAME_SNAPSHOT_VERSION = 1 as const
export const GAME_SNAPSHOT_PREFIX = `ASUD${GAME_SNAPSHOT_VERSION}.`

const MAX_ENCODED_SNAPSHOT_LENGTH = 4_000_000
const MAX_SNAPSHOT_STACK_LENGTH = 1_000
const MAX_METADATA_LENGTH = 16_384
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const VARIANTS: readonly VariantId[] = [
  'classic',
  'diagonal',
  'anti-knight',
]
const DIFFICULTIES: readonly DifficultyId[] = [
  'relaxed',
  'focused',
  'challenging',
  'expert',
  'master',
]
const INPUT_MODES: readonly InputMode[] = [
  'value',
  'corner',
  'center',
  'color',
]
const STATUSES: readonly GameState['status'][] = [
  'playing',
  'paused',
  'completed',
]
const COLORS: readonly CellColor[] = ['sage', 'sky', 'sand', 'rose']

export type SudokuShareErrorCode =
  | 'PUZZLE_INPUT_TYPE'
  | 'PUZZLE_LENGTH'
  | 'PUZZLE_CHARACTERS'
  | 'PUZZLE_VARIANT'
  | 'PUZZLE_DIFFICULTY'
  | 'PUZZLE_CONFLICT'
  | 'PUZZLE_NO_SOLUTION'
  | 'PUZZLE_MULTIPLE_SOLUTIONS'
  | 'PUZZLE_DEFINITION'
  | 'GAME_STATE'
  | 'SNAPSHOT_INPUT_TYPE'
  | 'SNAPSHOT_TOO_LARGE'
  | 'SNAPSHOT_FORMAT'
  | 'SNAPSHOT_VERSION'
  | 'SNAPSHOT_ENCODING'
  | 'SNAPSHOT_DATA'

/**
 * A typed, user-safe error for import/export flows. `code` is stable for UI
 * localization; the Portuguese message is suitable as an immediate fallback.
 */
export class SudokuShareError extends Error {
  readonly code: SudokuShareErrorCode

  constructor(code: SudokuShareErrorCode, message: string) {
    super(message)
    this.name = 'SudokuShareError'
    this.code = code
  }
}

function shareError(
  code: SudokuShareErrorCode,
  message: string,
): SudokuShareError {
  return new SudokuShareError(code, message)
}

function isVariant(value: unknown): value is VariantId {
  return VARIANTS.includes(value as VariantId)
}

function isDifficulty(value: unknown): value is DifficultyId {
  return DIFFICULTIES.includes(value as DifficultyId)
}

function importedGridString(givens: readonly number[]): string {
  return givens.map((value) => (value === 0 ? '0' : String(value))).join('')
}

/**
 * Imports the common 81-cell notation used by Sudoku sites and print tools.
 * Whitespace is ignored; both `0` and `.` represent an empty cell.
 */
export function parseImportedPuzzle(
  input: string,
  variant: VariantId,
  difficulty: DifficultyId = 'focused',
): PuzzleDefinition {
  if (typeof input !== 'string') {
    throw shareError(
      'PUZZLE_INPUT_TYPE',
      'O diagrama importado deve ser fornecido como texto.',
    )
  }
  if (!isVariant(variant)) {
    throw shareError(
      'PUZZLE_VARIANT',
      `A variante de Sudoku informada não é compatível: ${String(variant)}.`,
    )
  }
  if (!isDifficulty(difficulty)) {
    throw shareError(
      'PUZZLE_DIFFICULTY',
      `A dificuldade informada não é compatível: ${String(difficulty)}.`,
    )
  }

  const compact = input.replace(/\s/g, '')
  if (compact.length !== BOARD_SIZE) {
    throw shareError(
      'PUZZLE_LENGTH',
      `O diagrama deve conter exatamente ${BOARD_SIZE} células; foram recebidas ${compact.length}.`,
    )
  }
  if (!/^[0-9.]+$/.test(compact)) {
    throw shareError(
      'PUZZLE_CHARACTERS',
      'Use apenas os dígitos de 1 a 9, 0 ou ponto para células vazias.',
    )
  }

  const givens = [...compact].map((character) =>
    character === '.' ? 0 : character.charCodeAt(0) - 48,
  )
  if (conflictingCells(givens, variant).length > 0) {
    throw shareError(
      'PUZZLE_CONFLICT',
      'O diagrama contém dígitos em conflito para a variante escolhida.',
    )
  }

  const analysis = analyzeSolutions(givens, variant, 2)
  if (analysis.count === 0 || analysis.solution === null) {
    throw shareError(
      'PUZZLE_NO_SOLUTION',
      'O diagrama não possui solução para a variante escolhida.',
    )
  }
  if (!analysis.unique || analysis.count !== 1) {
    throw shareError(
      'PUZZLE_MULTIPLE_SOLUTIONS',
      'O diagrama possui múltiplas soluções; adicione mais pistas.',
    )
  }

  const canonical = importedGridString(givens)
  const seed = `import:${variant}:${canonical}`
  const fingerprint = hashSeed(`${variant}|${difficulty}|${canonical}|v1`)
    .toString(16)
    .padStart(8, '0')

  return {
    id: `import-${variant}-${difficulty}-${fingerprint}`,
    seed,
    variant,
    difficulty,
    givens,
    solution: analysis.solution,
    technique: 'imported',
    generatedAt: 0,
  }
}

/**
 * Exports only the puzzle clues, never its solution or the player's progress.
 */
export function exportPuzzleString(puzzle: PuzzleDefinition): string {
  try {
    assertPuzzleIsSafe(puzzle, false)
  } catch {
    throw shareError(
      'PUZZLE_DEFINITION',
      'Não foi possível exportar: a definição do Sudoku é inválida.',
    )
  }

  return puzzle.givens
    .map((value) => (value === 0 ? '.' : String(value)))
    .join('')
}

function assertMetadataString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_METADATA_LENGTH) {
    throw new Error(`${label} is not a safe string`)
  }
}

function assertPuzzleIsSafe(
  puzzle: PuzzleDefinition,
  requireUnique: boolean,
): void {
  assertPuzzleDefinition(puzzle)
  if (!isVariant(puzzle.variant)) throw new Error('Unsupported puzzle variant')
  if (!isDifficulty(puzzle.difficulty)) {
    throw new Error('Unsupported puzzle difficulty')
  }
  assertMetadataString(puzzle.id, 'Puzzle id')
  assertMetadataString(puzzle.seed, 'Puzzle seed')
  assertMetadataString(puzzle.technique, 'Puzzle technique')
  if (
    !Number.isFinite(puzzle.generatedAt) ||
    puzzle.generatedAt < 0 ||
    !Number.isSafeInteger(puzzle.generatedAt)
  ) {
    throw new Error('Invalid generation timestamp')
  }
  if (!isSolved(puzzle.solution, puzzle.variant)) {
    throw new Error('Puzzle solution does not satisfy its variant')
  }

  if (requireUnique) {
    const analysis = analyzeSolutions(puzzle.givens, puzzle.variant, 2)
    if (
      !analysis.unique ||
      analysis.solution === null ||
      analysis.solution.some(
        (value, index) => value !== puzzle.solution[index],
      )
    ) {
      throw new Error('Puzzle clues do not have the declared unique solution')
    }
  }
}

function hasUniqueDigits(values: readonly Digit[]): boolean {
  return new Set(values).size === values.length
}

function assertCellSemantics(
  cell: CellState,
  given: number,
): void {
  const shouldBeGiven = given !== 0
  if (cell.given !== shouldBeGiven) {
    throw new Error('Cell given flag does not match the puzzle')
  }
  if (shouldBeGiven && cell.value !== given) {
    throw new Error('A given cell was changed')
  }
  if (!hasUniqueDigits(cell.corner) || !hasUniqueDigits(cell.center)) {
    throw new Error('Candidate lists contain duplicates')
  }
}

function assertNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
}

function assertElapsed(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error('Elapsed time is outside the supported range')
  }
}

function assertSnapshotSemantics(
  snapshot: GameSnapshot,
  givens: readonly number[],
): void {
  snapshot.cells.forEach((cell, index) => {
    assertCellSemantics(cell, givens[index] ?? 0)
  })
  assertElapsed(snapshot.elapsedMs)
  assertNonnegativeSafeInteger(snapshot.mistakes, 'Mistakes')
  assertNonnegativeSafeInteger(snapshot.hintsUsed, 'Hints used')
}

function assertStateSemantics(state: GameState): void {
  assertPuzzleIsSafe(state.puzzle, true)
  if (
    state.history.length > MAX_SNAPSHOT_STACK_LENGTH ||
    state.future.length > MAX_SNAPSHOT_STACK_LENGTH
  ) {
    throw new Error('Snapshot history is too large')
  }

  state.cells.forEach((cell, index) => {
    assertCellSemantics(cell, state.puzzle.givens[index] ?? 0)
  })
  state.history.forEach((snapshot) =>
    assertSnapshotSemantics(snapshot, state.puzzle.givens),
  )
  state.future.forEach((snapshot) =>
    assertSnapshotSemantics(snapshot, state.puzzle.givens),
  )

  if (
    state.selected.length > BOARD_SIZE ||
    new Set(state.selected).size !== state.selected.length
  ) {
    throw new Error('Selection contains duplicate or excessive cells')
  }
  if (
    (state.anchor === -1 && state.selected.length !== 0) ||
    (state.anchor >= 0 && !state.selected.includes(state.anchor))
  ) {
    throw new Error('Selection anchor is inconsistent')
  }
  assertElapsed(state.elapsedMs)
  assertNonnegativeSafeInteger(state.mistakes, 'Mistakes')
  assertNonnegativeSafeInteger(state.hintsUsed, 'Hints used')
}

function validatedState(value: unknown, code: 'GAME_STATE' | 'SNAPSHOT_DATA'): GameState {
  let migrated: ReturnType<typeof migrateSession>
  try {
    migrated = migrateSession(value)
  } catch {
    migrated = null
  }
  if (migrated === null) {
    throw shareError(
      code,
      code === 'GAME_STATE'
        ? 'Não foi possível exportar: o estado do jogo é inválido.'
        : 'O compartilhamento não contém um estado de jogo válido.',
    )
  }

  try {
    assertStateSemantics(migrated.state)
  } catch {
    throw shareError(
      code,
      code === 'GAME_STATE'
        ? 'Não foi possível exportar: o estado do jogo é inconsistente.'
        : 'O estado compartilhado é inconsistente ou foi corrompido.',
    )
  }
  return migrated.state
}

type SparseDigits = Array<[index: number, digits: string]>
type SparseColors = Array<[index: number, color: number]>
type CompactBoard = [
  values: string,
  corner: SparseDigits,
  center: SparseDigits,
  colors: SparseColors,
]
type CompactPuzzle = [
  id: string,
  seed: string,
  variant: VariantId,
  difficulty: DifficultyId,
  givens: string,
  solution: string,
  technique: string,
  generatedAt: number,
]
type CompactGameSnapshot = [
  board: CompactBoard,
  elapsedMs: number,
  mistakes: number,
  hintsUsed: number,
]
type CompactHint = [
  technique: string,
  title: string,
  explanation: string,
  cells: number[],
  digit: number,
  phase: HintStep['phase'],
]
type CompactState = [
  puzzle: CompactPuzzle,
  board: CompactBoard,
  selected: number[],
  anchor: number,
  activeDigit: number,
  inputMode: number,
  history: CompactGameSnapshot[],
  future: CompactGameSnapshot[],
  elapsedMs: number,
  lastResumedAt: number | null,
  mistakes: number,
  hintsUsed: number,
  hint: CompactHint | null,
  status: number,
  completedAt: number | null,
]

function encodeBoard(cells: readonly CellState[]): CompactBoard {
  const values = cells
    .map((cell) => (cell.value === null ? '0' : String(cell.value)))
    .join('')
  const corner: SparseDigits = []
  const center: SparseDigits = []
  const colors: SparseColors = []

  cells.forEach((cell, index) => {
    if (cell.corner.length > 0) corner.push([index, cell.corner.join('')])
    if (cell.center.length > 0) center.push([index, cell.center.join('')])
    if (cell.color !== null) colors.push([index, COLORS.indexOf(cell.color) + 1])
  })

  return [values, corner, center, colors]
}

function encodePuzzle(puzzle: PuzzleDefinition): CompactPuzzle {
  return [
    puzzle.id,
    puzzle.seed,
    puzzle.variant,
    puzzle.difficulty,
    importedGridString(puzzle.givens),
    puzzle.solution.join(''),
    puzzle.technique,
    puzzle.generatedAt,
  ]
}

function encodeSnapshot(snapshot: GameSnapshot): CompactGameSnapshot {
  return [
    encodeBoard(snapshot.cells),
    snapshot.elapsedMs,
    snapshot.mistakes,
    snapshot.hintsUsed,
  ]
}

function encodeHint(hint: HintStep | null): CompactHint | null {
  if (hint === null) return null
  return [
    hint.technique,
    hint.title,
    hint.explanation,
    [...hint.cells],
    hint.digit ?? 0,
    hint.phase,
  ]
}

function compactState(state: GameState): CompactState {
  return [
    encodePuzzle(state.puzzle),
    encodeBoard(state.cells),
    [...state.selected],
    state.anchor,
    state.activeDigit ?? 0,
    INPUT_MODES.indexOf(state.inputMode),
    state.history.map(encodeSnapshot),
    state.future.map(encodeSnapshot),
    state.elapsedMs,
    state.lastResumedAt,
    state.mistakes,
    state.hintsUsed,
    encodeHint(state.hint),
    STATUSES.indexOf(state.status),
    state.completedAt,
  ]
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] as number
    const hasSecond = index + 1 < bytes.length
    const hasThird = index + 2 < bytes.length
    const second = hasSecond ? (bytes[index + 1] as number) : 0
    const third = hasThird ? (bytes[index + 2] as number) : 0

    result += BASE64URL_ALPHABET[first >>> 2]
    result += BASE64URL_ALPHABET[((first & 0b11) << 4) | (second >>> 4)]
    if (hasSecond) {
      result +=
        BASE64URL_ALPHABET[((second & 0b1111) << 2) | (third >>> 6)]
    }
    if (hasThird) result += BASE64URL_ALPHABET[third & 0b11_1111]
  }

  return result
}

function decodeBase64Url(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error('Invalid base64url payload')
  }

  const bytes = new Uint8Array(Math.floor((value.length * 6) / 8))
  let buffer = 0
  let bitCount = 0
  let byteIndex = 0

  for (const character of value) {
    const digit = BASE64URL_ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('Invalid base64url digit')
    buffer = (buffer << 6) | digit
    bitCount += 6

    if (bitCount >= 8) {
      bitCount -= 8
      bytes[byteIndex] = (buffer >>> bitCount) & 0xff
      byteIndex += 1
      buffer &= bitCount === 0 ? 0 : (1 << bitCount) - 1
    }
  }

  if (buffer !== 0) throw new Error('Non-canonical base64url payload')
  return bytes
}

/**
 * Produces a deterministic, URL-safe (but URL-independent) v1 share string.
 * The tuple schema and sparse notes keep long sessions substantially smaller
 * than serializing the public GameState object directly.
 */
export function exportGameSnapshot(state: GameState): string {
  const safeState = validatedState(state, 'GAME_STATE')
  const json = JSON.stringify(compactState(safeState))
  const encoded = encodeBase64Url(new TextEncoder().encode(json))
  const result = `${GAME_SNAPSHOT_PREFIX}${encoded}`

  if (result.length > MAX_ENCODED_SNAPSHOT_LENGTH) {
    throw shareError(
      'SNAPSHOT_TOO_LARGE',
      'O histórico deste jogo é grande demais para compartilhamento.',
    )
  }
  return result
}

function exactTuple(value: unknown, length: number): unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error('Unexpected compact tuple')
  }
  return value
}

function decodeGridString(
  value: unknown,
  allowZero: boolean,
): number[] {
  const pattern = allowZero ? /^[0-9]{81}$/ : /^[1-9]{81}$/
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error('Invalid compact grid')
  }
  return [...value].map((character) => character.charCodeAt(0) - 48)
}

function decodePuzzle(value: unknown): PuzzleDefinition {
  const tuple = exactTuple(value, 8)
  const [id, seed, variant, difficulty, givens, solution, technique, generatedAt] =
    tuple

  assertMetadataString(id, 'Puzzle id')
  assertMetadataString(seed, 'Puzzle seed')
  assertMetadataString(technique, 'Puzzle technique')
  if (!isVariant(variant) || !isDifficulty(difficulty)) {
    throw new Error('Unsupported compact puzzle metadata')
  }
  if (
    typeof generatedAt !== 'number' ||
    !Number.isSafeInteger(generatedAt) ||
    generatedAt < 0
  ) {
    throw new Error('Invalid compact generation timestamp')
  }

  return {
    id,
    seed,
    variant,
    difficulty,
    givens: decodeGridString(givens, true),
    solution: decodeGridString(solution, false),
    technique,
    generatedAt,
  }
}

function decodeSparseDigits(
  value: unknown,
  cells: CellState[],
  property: 'corner' | 'center',
): void {
  if (!Array.isArray(value) || value.length > BOARD_SIZE) {
    throw new Error('Invalid sparse candidates')
  }
  const seen = new Set<number>()

  for (const rawEntry of value) {
    const entry = exactTuple(rawEntry, 2)
    const [index, encodedDigits] = entry
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= BOARD_SIZE ||
      seen.has(index) ||
      typeof encodedDigits !== 'string' ||
      !/^[1-9]{1,9}$/.test(encodedDigits)
    ) {
      throw new Error('Invalid sparse candidate entry')
    }
    const digits = [...encodedDigits].map(
      (character) => (character.charCodeAt(0) - 48) as Digit,
    )
    if (!hasUniqueDigits(digits)) {
      throw new Error('Duplicate compact candidates')
    }
    const cell = cells[index]
    if (cell === undefined) throw new Error('Candidate cell is unavailable')
    cell[property] = digits
    seen.add(index)
  }
}

function decodeSparseColors(value: unknown, cells: CellState[]): void {
  if (!Array.isArray(value) || value.length > BOARD_SIZE) {
    throw new Error('Invalid sparse colors')
  }
  const seen = new Set<number>()

  for (const rawEntry of value) {
    const entry = exactTuple(rawEntry, 2)
    const [index, code] = entry
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= BOARD_SIZE ||
      seen.has(index) ||
      typeof code !== 'number' ||
      !Number.isInteger(code) ||
      code < 1 ||
      code > COLORS.length
    ) {
      throw new Error('Invalid sparse color entry')
    }
    const color = COLORS[code - 1]
    const cell = cells[index]
    if (color === undefined || cell === undefined) {
      throw new Error('Color cell is unavailable')
    }
    cell.color = color
    seen.add(index)
  }
}

function decodeBoard(value: unknown, givens: readonly number[]): CellState[] {
  const tuple = exactTuple(value, 4)
  const values = decodeGridString(tuple[0], true)
  const cells: CellState[] = values.map((valueAtCell, index) => ({
    value: valueAtCell === 0 ? null : (valueAtCell as Digit),
    given: (givens[index] ?? 0) !== 0,
    corner: [],
    center: [],
    color: null,
  }))

  decodeSparseDigits(tuple[1], cells, 'corner')
  decodeSparseDigits(tuple[2], cells, 'center')
  decodeSparseColors(tuple[3], cells)

  cells.forEach((cell, index) => {
    const given = givens[index] ?? 0
    if (given !== 0 && cell.value !== given) {
      throw new Error('A compact given cell was changed')
    }
  })
  return cells
}

function decodeSnapshot(
  value: unknown,
  givens: readonly number[],
): GameSnapshot {
  const tuple = exactTuple(value, 4)
  return {
    cells: decodeBoard(tuple[0], givens),
    elapsedMs: tuple[1] as number,
    mistakes: tuple[2] as number,
    hintsUsed: tuple[3] as number,
  }
}

function decodeSnapshotStack(
  value: unknown,
  givens: readonly number[],
): GameSnapshot[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_SNAPSHOT_STACK_LENGTH
  ) {
    throw new Error('Invalid compact history')
  }
  return value.map((snapshot) => decodeSnapshot(snapshot, givens))
}

function decodeSelection(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > BOARD_SIZE) {
    throw new Error('Invalid compact selection')
  }
  const selected = value.map((index) => {
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= BOARD_SIZE
    ) {
      throw new Error('Invalid compact cell index')
    }
    return index
  })
  if (new Set(selected).size !== selected.length) {
    throw new Error('Duplicate compact cell index')
  }
  return selected
}

function decodeEnum<T>(value: unknown, values: readonly T[]): T {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= values.length
  ) {
    throw new Error('Invalid compact enum')
  }
  const result = values[value]
  if (result === undefined) throw new Error('Unavailable compact enum')
  return result
}

function decodeActiveDigit(value: unknown): Digit | null {
  if (value === 0) return null
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 9
  ) {
    throw new Error('Invalid compact active digit')
  }
  return value as Digit
}

function decodeHint(value: unknown): HintStep | null {
  if (value === null) return null
  const tuple = exactTuple(value, 6)
  const [technique, title, explanation, cellsValue, digitValue, phase] = tuple
  assertMetadataString(technique, 'Hint technique')
  assertMetadataString(title, 'Hint title')
  assertMetadataString(explanation, 'Hint explanation')
  const cells = decodeSelection(cellsValue)
  if (
    typeof digitValue !== 'number' ||
    !Number.isInteger(digitValue) ||
    digitValue < 0 ||
    digitValue > 9 ||
    (phase !== 1 && phase !== 2 && phase !== 3 && phase !== 4)
  ) {
    throw new Error('Invalid compact hint')
  }

  const hint: HintStep = {
    technique,
    title,
    explanation,
    cells,
    phase,
  }
  if (digitValue !== 0) hint.digit = digitValue as Digit
  return hint
}

function expandState(value: unknown): GameState {
  const tuple = exactTuple(value, 15)
  const puzzle = decodePuzzle(tuple[0])
  const selected = decodeSelection(tuple[2])
  const anchor = tuple[3]
  if (
    typeof anchor !== 'number' ||
    !Number.isInteger(anchor) ||
    anchor < -1 ||
    anchor >= BOARD_SIZE
  ) {
    throw new Error('Invalid compact anchor')
  }

  return {
    puzzle,
    cells: decodeBoard(tuple[1], puzzle.givens),
    selected,
    anchor,
    activeDigit: decodeActiveDigit(tuple[4]),
    inputMode: decodeEnum(tuple[5], INPUT_MODES),
    history: decodeSnapshotStack(tuple[6], puzzle.givens),
    future: decodeSnapshotStack(tuple[7], puzzle.givens),
    elapsedMs: tuple[8] as number,
    lastResumedAt: tuple[9] as number | null,
    mistakes: tuple[10] as number,
    hintsUsed: tuple[11] as number,
    hint: decodeHint(tuple[12]),
    status: decodeEnum(tuple[13], STATUSES),
    completedAt: tuple[14] as number | null,
  }
}

/**
 * Imports only the explicitly versioned compact schema. The result is rebuilt
 * into fresh objects and passed through the persistence validator plus stricter
 * puzzle/cell consistency checks before it is returned.
 */
export function importGameSnapshot(serialized: string): GameState {
  if (typeof serialized !== 'string') {
    throw shareError(
      'SNAPSHOT_INPUT_TYPE',
      'O compartilhamento do jogo deve ser fornecido como texto.',
    )
  }
  if (serialized.length > MAX_ENCODED_SNAPSHOT_LENGTH) {
    throw shareError(
      'SNAPSHOT_TOO_LARGE',
      'O compartilhamento é grande demais para ser processado com segurança.',
    )
  }

  const value = serialized.trim()
  const match = /^ASUD(\d+)\.([A-Za-z0-9_-]+)$/.exec(value)
  if (match === null) {
    throw shareError(
      'SNAPSHOT_FORMAT',
      'O texto não está no formato de compartilhamento do Absolute Sudoku.',
    )
  }
  if (match[1] !== String(GAME_SNAPSHOT_VERSION)) {
    throw shareError(
      'SNAPSHOT_VERSION',
      `Esta versão de compartilhamento (v${match[1]}) ainda não é compatível.`,
    )
  }

  let decoded: unknown
  try {
    const bytes = decodeBase64Url(match[2] as string)
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    decoded = JSON.parse(json) as unknown
  } catch {
    throw shareError(
      'SNAPSHOT_ENCODING',
      'O compartilhamento está incompleto ou foi corrompido.',
    )
  }

  let expanded: GameState
  try {
    expanded = expandState(decoded)
  } catch {
    throw shareError(
      'SNAPSHOT_DATA',
      'O compartilhamento contém dados inválidos ou inconsistentes.',
    )
  }
  return validatedState(expanded, 'SNAPSHOT_DATA')
}
