import type { DifficultyId, PuzzleDefinition, VariantId } from '../domain/types'
import {
  generatePuzzle,
  type GeneratePuzzleOptions,
  type GeneratorRequest,
  type GeneratorResponse,
} from './generator'

export interface WorkerGenerationOptions {
  generatedAt?: number
  signal?: AbortSignal
}

let nextRequestId = 0

function abortError(): DOMException {
  return new DOMException('Sudoku generation was cancelled', 'AbortError')
}

/**
 * Runs generation away from the interaction thread when Worker is available,
 * and retains a synchronous-engine fallback for SSR and test environments.
 */
export function generatePuzzleInWorker(
  seed: string,
  variant: VariantId = 'classic',
  difficulty: DifficultyId = 'focused',
  options: WorkerGenerationOptions = {},
): Promise<PuzzleDefinition> {
  if (options.signal?.aborted) return Promise.reject(abortError())

  if (typeof Worker === 'undefined') {
    const generationOptions: GeneratePuzzleOptions = {
      seed,
      variant,
      difficulty,
    }
    if (options.generatedAt !== undefined) {
      generationOptions.generatedAt = options.generatedAt
    }
    return Promise.resolve(generatePuzzle(generationOptions))
  }

  return new Promise<PuzzleDefinition>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/generator.worker.ts', import.meta.url),
      {
        type: 'module',
        name: 'absolute-sudoku-generator',
      },
    )
    const id = `generation-${nextRequestId}`
    nextRequestId += 1

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
    }

    const handleAbort = (): void => {
      cleanup()
      reject(abortError())
    }

    worker.addEventListener('message', (event: MessageEvent<GeneratorResponse>) => {
      if (event.data.id !== id) return
      cleanup()

      if (event.data.ok) {
        resolve(event.data.puzzle)
      } else {
        reject(new Error(event.data.error))
      }
    })

    worker.addEventListener('error', (event) => {
      cleanup()
      reject(new Error(event.message || 'Sudoku generator worker failed'))
    })

    options.signal?.addEventListener('abort', handleAbort, { once: true })

    const request: GeneratorRequest = {
      id,
      seed,
      variant,
      difficulty,
    }
    if (options.generatedAt !== undefined) {
      request.generatedAt = options.generatedAt
    }
    worker.postMessage(request)
  })
}
