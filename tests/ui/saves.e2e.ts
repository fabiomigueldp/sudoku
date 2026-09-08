import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../../src/domain/catalog'
import { createGameState } from '../../src/game/state'
import { gameActions, reduceGame } from '../../src/game/reducer'
import { dailySeed } from '../../src/engine/daily'
import { puzzleWithGivens, SOLUTION } from '../game/fixture'

async function seedLegacy(page: Page, indexed = false) {
  const state = createGameState(puzzleWithGivens(), { now: Date.now(), startPaused: true })
  await page.addInitScript(({ state, indexed }) => {
    if (sessionStorage.getItem('saves-seeded')) return
    sessionStorage.setItem('saves-seeded', 'true')
    const session = { schemaVersion: 3, savedAt: Date.now(), state, eventLog: null }
    if (indexed) {
      const request = indexedDB.open('absolute-sudoku', 4)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of ['sessions', 'settings', 'stats', 'archives', 'archiveIndex', 'practice', 'metadata']) db.createObjectStore(name)
        request.transaction!.objectStore('sessions').put(session, 'active')
      }
      request.onsuccess = () => request.result.close()
    } else {
      localStorage.setItem('absolute-sudoku:session:v2', JSON.stringify(session))
    }
  }, { state, indexed })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Partidas salvas · 1/ })).toBeVisible()
}

async function importAnother(page: Page) {
  await page.getByRole('button', { name: 'Novo Sudoku', exact: true }).click()
  await page.getByRole('button', { name: /Importar uma grade/ }).click()
  const givens = [...SOLUTION]
  givens[0] = 0
  givens[10] = 0
  await page.getByLabel('Grade ou estado compartilhado').fill(givens.join(''))
  await page.getByRole('button', { name: 'Abrir grade', exact: true }).click()
  await expect(page.getByRole('gridcell')).toHaveCount(81)
}

async function openSaved(page: Page) {
  await page.getByRole('button', { name: 'Opções da partida' }).click()
  await page.getByRole('button', { name: /Partidas salvas/ }).click()
  await expect(page.getByRole('heading', { name: 'Partidas salvas' })).toBeVisible()
}

test('legacy IndexedDB saves migrate and keep independent progress through switches and reloads', async ({ page }) => {
  await seedLegacy(page, true)
  await page.getByRole('button', { name: /^Continuar / }).click()
  await page.getByRole('gridcell').nth(10).click()
  await page.getByRole('radio', { name: 'Canto', exact: true }).click()
  await page.locator('.number-key').nth(2).click()
  await page.getByRole('radio', { name: 'Cor', exact: true }).click()
  await page.locator('.color-key').nth(1).click()
  await openSaved(page)
  await importAnother(page)
  await page.getByRole('gridcell').nth(0).click()
  await page.locator('.number-key').nth(0).click()
  await openSaved(page)
  await expect(page.locator('.saved-open')).toHaveCount(2)
  await page.locator('.saved-open').nth(1).click()
  await expect(page.getByRole('gridcell').nth(10)).toHaveAttribute('aria-label', /canto 3/)
  await expect(page.getByRole('gridcell').nth(10)).toHaveAttribute('data-color', 'sky')
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.getByRole('gridcell').nth(10)).not.toHaveAttribute('data-color')
  await page.reload()
  await page.getByRole('button', { name: /^Partidas salvas/ }).click()
  await expect(page.locator('.saved-open')).toHaveCount(2)
  await page.locator('.saved-open').nth(1).click()
  await expect(page.getByRole('gridcell').nth(0)).toHaveAttribute('aria-label', /valor 1/)
})

test('importing the same grid twice creates independent saves, and deletion requires an inline choice', async ({ page }) => {
  await page.goto('/')
  await importAnother(page)
  await openSaved(page)
  await importAnother(page)
  await openSaved(page)
  await expect(page.locator('.saved-open')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Excluir/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Organizar', exact: true }).click()
  await page.locator('.saved-delete').nth(0).click()
  await expect(page.getByRole('button', { name: 'Manter partida' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.saved-delete').nth(0)).toBeFocused()
  await expect(page.locator('.saved-open')).toHaveCount(2)
  await page.locator('.saved-delete').nth(0).click()
  await page.getByRole('button', { name: 'Excluir partida', exact: true }).click()
  await expect(page.locator('.saved-open')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Concluir organização' })).toBeFocused()
  await page.reload()
  await page.getByRole('button', { name: /^Partidas salvas/ }).click()
  await expect(page.locator('.saved-open')).toHaveCount(1)
  await page.locator('.saved-open').click()
  await expect(page.getByRole('gridcell')).toHaveCount(81)
})

test('time spent browsing saves and on the home screen is never charged to a puzzle', async ({ page }) => {
  await seedLegacy(page)
  const now = Date.now()
  await page.clock.setFixedTime(now + 60_000)
  await page.getByRole('button', { name: /^Continuar / }).click()
  await openSaved(page)
  const time = await page.locator('.saved-progress').textContent()
  await page.clock.setFixedTime(now + 180_000)
  await page.locator('.saved-open').click()
  await openSaved(page)
  expect(await page.locator('.saved-progress').textContent()).toBe(time)
})

test('the daily shortcut resumes its saved attempt even after playing another puzzle', async ({ page }) => {
  const date = new Date('2026-09-03T12:00:00')
  await page.clock.setFixedTime(date)
  const puzzle = puzzleWithGivens()
  puzzle.seed = dailySeed(date, 'classic', 'focused')
  const state = createGameState(puzzle, { now: date.getTime(), startPaused: true })
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('daily-seeded')) return
    sessionStorage.setItem('daily-seeded', 'true')
    localStorage.setItem('absolute-sudoku:session:v2', JSON.stringify({
      schemaVersion: 3, savedAt: Date.now(), state, eventLog: null,
    }))
  }, state)
  await page.goto('/')
  await page.getByRole('button', { name: /^Continuar / }).click()
  await expect(page.getByRole('gridcell')).toHaveCount(81)
  const empty = page.getByRole('gridcell').filter({ hasText: /^$/ }).first()
  const label = await empty.getAttribute('aria-label')
  await empty.click()
  await page.getByRole('radio', { name: 'Canto', exact: true }).click()
  await page.locator('.number-key').nth(6).click()
  await openSaved(page)
  await importAnother(page)
  await page.getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await page.getByRole('button', { name: /Desafio diário/ }).click()
  const coordinate = label!.split(',').slice(0, 2).join(',')
  await expect(page.getByRole('gridcell', { name: new RegExp(coordinate) })).toHaveAttribute('aria-label', /canto 7/)
  await openSaved(page)
  await expect(page.locator('.saved-open')).toHaveCount(2)
})

test('completion moves only that attempt to the archive and offers the remaining game on home', async ({ page }) => {
  await seedLegacy(page)
  await importAnother(page)
  await page.getByRole('gridcell').nth(0).click()
  await page.locator('.number-key').nth(SOLUTION[0]! - 1).click()
  await page.getByRole('gridcell').nth(10).click()
  await page.locator('.number-key').nth(SOLUTION[10]! - 1).click()
  await expect(page.getByRole('dialog', { name: 'Grade concluída' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Partidas salvas · 1/ })).toBeVisible()
  await page.getByRole('button', { name: /^Continuar / }).click()
  await expect(page.getByRole('gridcell').nth(0)).toHaveAttribute('aria-label', /vazia/)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Partidas salvas · 1/ })).toBeVisible()
})

test('saved games remain readable at 320px with dark theme and high contrast', async ({ page }, testInfo) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('absolute-sudoku:settings:v2', JSON.stringify(settings))
  }, { ...DEFAULT_SETTINGS, theme: 'dark', highContrast: true })
  await page.setViewportSize({ width: 320, height: 740 })
  await seedLegacy(page)
  await page.getByRole('button', { name: /^Partidas salvas/ }).click()
  await page.getByRole('button', { name: 'Organizar', exact: true }).click()
  await page.locator('.saved-delete').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const button of await page.locator('.saved-toolbar button, .saved-delete, .saved-confirmation button').all()) {
    // Firefox can report 44 CSS pixels as 43.99998474121094 on Linux.
    // Tolerate measurement precision without accepting a smaller touch target.
    expect((await button.boundingBox())!.height + 0.001).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: testInfo.outputPath('saved-mobile-dark.png'), fullPage: true })
})

test('backup restores every saved game through Settings, including after clearing local data', async ({ page }) => {
  await seedLegacy(page)
  await importAnother(page)
  await page.getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Exportar backup/ }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  await expect(page.getByRole('status')).toContainText('2 em andamento')
  await page.getByRole('button', { name: /Apagar dados/ }).click()
  await page.getByRole('button', { name: 'Apagar definitivamente' }).click()
  await expect(page.getByRole('button', { name: /^Partidas salvas/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(path!)
  await expect(page.getByRole('group', { name: 'Confirmar restauração' })).toContainText('2 em andamento')
  await page.getByRole('button', { name: 'Restaurar este backup' }).click()
  await expect(page.getByRole('status')).toContainText('Backup restaurado')
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.getByRole('button', { name: /^Partidas salvas/ }).click()
  await expect(page.locator('.saved-open')).toHaveCount(2)
  await page.reload()
  await page.getByRole('button', { name: /^Partidas salvas/ }).click()
  await expect(page.locator('.saved-open')).toHaveCount(2)
})

test('a completed recovery checkpoint is archived before continuing another saved game', async ({ page }) => {
  const givens = [...SOLUTION]
  givens[0] = 0
  const now = Date.now()
  const finished = reduceGame(
    createGameState(puzzleWithGivens(givens), { now: now - 1_000 }),
    gameActions.setDigit(SOLUTION[0] as 1, now),
  )
  const remaining = createGameState(puzzleWithGivens(), { now, startPaused: true })
  await page.addInitScript(({ finished, remaining, now }) => {
    if (sessionStorage.getItem('completion-seeded')) return
    sessionStorage.setItem('completion-seeded', 'true')
    localStorage.setItem('absolute-sudoku:checkpoint:v1', JSON.stringify({
      id: 'finished', schemaVersion: 4, savedAt: now, state: finished, eventLog: null,
    }))
    localStorage.setItem('absolute-sudoku:saved:v1:remaining', JSON.stringify({
      id: 'remaining', schemaVersion: 4, savedAt: now - 1_000, state: remaining, eventLog: null,
    }))
  }, { finished, remaining, now })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /^Partidas salvas · 1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Estatísticas', exact: true }).click()
  await expect(page.locator('.stats-summary').getByText('Concluídos')).toBeVisible()
  await expect(page.locator('.stats-summary > div').first()).toContainText('1')
  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.getByRole('button', { name: /^Continuar / }).click()
  await expect(page.getByRole('gridcell').nth(0)).toHaveAttribute('aria-label', /vazia/)
})
