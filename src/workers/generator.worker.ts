/// <reference lib="webworker" />

import {
  generatePuzzle,
  type GeneratePuzzleOptions,
  type GeneratorRequest,
  type GeneratorResponse,
} from '../engine/generator'

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.addEventListener('message', (event: MessageEvent<GeneratorRequest>) => {
  const request = event.data

  try {
    const options: GeneratePuzzleOptions = {
      seed: request.seed,
      variant: request.variant,
      difficulty: request.difficulty,
    }

    if (request.generatedAt !== undefined) {
      options.generatedAt = request.generatedAt
    }
    if (request.targetTechnique !== undefined) {
      options.targetTechnique = request.targetTechnique
    }

    const response: GeneratorResponse = {
      id: request.id,
      ok: true,
      puzzle: generatePuzzle(options),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: GeneratorResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown generation error',
    }
    workerScope.postMessage(response)
  }
})

export {}
