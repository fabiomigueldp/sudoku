import type { DifficultyId, VariantId } from '../domain/types'
import { createSeededRandom } from './random'

interface GenerationReserve {
  variant: VariantId
  difficulty: DifficultyId
  givens: string
  solution: string
}

// Rated with the same logical analyzer as normal generation. These cover every
// daily profile. They are a bounded safety net, not a relaxation of difficulty.
export const GENERATION_RESERVES: readonly GenerationReserve[] = [
  {
    variant: 'classic', difficulty: 'focused',
    givens: '790158400310967008000200009000820305020509010901046000600002000200683041008495067',
    solution: '792158436314967528586234179467821395823579614951346782649712853275683941138495267',
  },
  {
    variant: 'classic', difficulty: 'challenging',
    givens: '085603000007050000069200058630010080090000040050020031570001820000030700000507310',
    solution: '185693472247158693369274158632419587791385246458726931573961824914832765826547319',
  },
  {
    variant: 'diagonal', difficulty: 'focused',
    givens: '098502000146007085057000931003800090004709600020005800685000140970100368000608520',
    solution: '398512476146937285257486931563841792814729653729365814685293147972154368431678529',
  },
  {
    variant: 'classic', difficulty: 'expert',
    givens: '004501902000000040027400001160054000000708000000160095500006410010000000706805200',
    solution: '634581972951672348827439651168954723395728164472163895583296417219347586746815239',
  },
  {
    variant: 'anti-knight', difficulty: 'focused',
    givens: '800000579506710038700500406423057060000000000080940352308001005960078103241000007',
    solution: '814632579596714238732589416423857961659123784187946352378491625965278143241365897',
  },
  {
    variant: 'diagonal', difficulty: 'challenging',
    givens: '000305827002040000000890006090051608500000002306280010600039000000020700429508000',
    solution: '964315827852746193713892546297451638581963472346287915678139254135624789429578361',
  },
  {
    variant: 'classic', difficulty: 'master',
    givens: '000002050050130600204050000500003019100000003930600004000080407005041080070300000',
    solution: '713462958859137642264859371546273819182594763937618524621985437395741286478326195',
  },
]

/** Square symmetries preserve classic, diagonal and anti-knight constraints. */
function transform(grid: number[], turns: number, reflect: boolean, digits: number[]) {
  return Array.from({ length: 81 }, (_, index) => {
    let row = Math.floor(index / 9)
    let column = index % 9
    if (reflect) column = 8 - column
    for (let turn = 0; turn < turns; turn++) [row, column] = [column, 8 - row]
    const value = grid[row * 9 + column]!
    return value === 0 ? 0 : digits[value - 1]!
  })
}

export function* reserveCandidates(seed: string, variant: VariantId, difficulty: DifficultyId) {
  const reserve = GENERATION_RESERVES.find((entry) =>
    entry.variant === variant && entry.difficulty === difficulty,
  )
  if (!reserve) return
  const givens = Array.from(reserve.givens, Number)
  const solution = Array.from(reserve.solution, Number)
  const random = createSeededRandom(`absolute-sudoku:reserve:v1:${seed}:${variant}:${difficulty}`)
  for (let attempt = 0; attempt < 16; attempt++) {
    const turns = random.integer(4)
    const reflect = random.boolean()
    const digits = random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
    yield {
      givens: transform(givens, turns, reflect, digits),
      solution: transform(solution, turns, reflect, digits),
    }
  }
  // Changing traversal/digit order can change the analyzer's chosen solve path.
  // Always retain the original rated board if no transformed path qualifies.
  yield { givens, solution }
}
