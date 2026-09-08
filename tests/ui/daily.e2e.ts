import { expect, test } from '@playwright/test'
import { GENERATION_RESERVES } from '../../src/engine/generationReserves'
import { createGameState } from '../../src/game/state'
import { puzzleWithGivens } from '../game/fixture'

test.use({ timezoneId: 'America/Sao_Paulo' })

test('the September 8 daily opens through the real generation worker', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-08T15:00:00Z'))
  await page.goto('/')
  await page.getByRole('button', { name: /Desafio diário/ }).click()
  await expect(page.getByRole('gridcell')).toHaveCount(81, { timeout: 20_000 })
  await expect(page.locator('.board-frame')).toHaveAttribute('data-variant', 'diagonal')
  const empty = page.locator('.sudoku-cell:not([data-given])').first()
  const label = await empty.getAttribute('aria-label')
  await empty.click()
  await page.getByRole('radio', { name: 'Canto', exact: true }).click()
  await page.locator('.number-key').nth(6).click()
  await page.getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await page.getByRole('button', { name: /Desafio diário/ }).click()
  const coordinate = label!.split(',').slice(0, 2).join(',')
  await expect(page.getByRole('gridcell', { name: new RegExp(coordinate) })).toHaveAttribute('aria-label', /canto 7/)
})

test('a daily saved by generator v3 resumes through the daily shortcut after the upgrade', async ({ page }) => {
  const date = new Date('2026-09-08T15:00:00Z')
  await page.clock.setFixedTime(date)
  const reserve = GENERATION_RESERVES.find((entry) => entry.variant === 'diagonal' && entry.difficulty === 'challenging')!
  const state = createGameState({
    ...puzzleWithGivens(),
    ...reserve,
    seed: 'absolute-sudoku:daily:v2:g3:2026-09-08:diagonal:challenging',
    givens: Array.from(reserve.givens, Number),
    solution: Array.from(reserve.solution, Number),
  }, { now: date.getTime(), startPaused: true })
  state.cells[0]!.corner = [7]
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('daily-seeded')) return
    sessionStorage.setItem('daily-seeded', 'true')
    localStorage.setItem('absolute-sudoku:session:v2', JSON.stringify({
      schemaVersion: 3, savedAt: Date.now(), state, eventLog: null,
    }))
  }, state)
  await page.goto('/?intent=daily')
  await expect(page.getByRole('gridcell')).toHaveCount(81)
  await expect(page.getByRole('gridcell').first()).toHaveAttribute('aria-label', /canto 7/)
  await page.getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await expect(page.getByRole('button', { name: /Partidas salvas · 1/ })).toBeVisible()
})
