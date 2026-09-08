import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../../src/domain/catalog'
import type { GameSettings, GameState } from '../../src/domain/types'
import { createGameState } from '../../src/game/state'
import { puzzleWithGivens, SOLUTION } from '../game/fixture'

async function start(
  page: Page,
  state: GameState = createGameState(puzzleWithGivens(), { now: Date.now() }),
  settings: Partial<GameSettings> = {},
) {
  await page.addInitScript(({ state, settings }) => {
    if (sessionStorage.getItem('test-seeded')) return
    sessionStorage.setItem('test-seeded', 'true')
    localStorage.setItem('absolute-sudoku:session:v2', JSON.stringify({
      schemaVersion: 3, savedAt: Date.now(), state, eventLog: null,
    }))
    localStorage.setItem('absolute-sudoku:settings:v2', JSON.stringify(settings))
  }, { state, settings: { ...DEFAULT_SETTINGS, ...settings } })
  await page.goto('/?intent=resume')
  await expect(page.getByRole('gridcell')).toHaveCount(81)
}

const cell = (page: Page, index: number) => page.getByRole('gridcell').nth(index)
const digit = (page: Page, value: number) => page.locator('.number-key').nth(value - 1)

test('automatic finish is optional, accessible, reversible and survives reload', async ({ page }) => {
  const state = createGameState(puzzleWithGivens(SOLUTION.map((value, index) => index < 10 ? 0 : value)), { now: Date.now() })
  await start(page, state)
  const finish = page.getByRole('button', { name: 'Concluir as 10 casas restantes' })
  await expect(finish).toBeVisible()
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /vazia/)
  await finish.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Grade concluída' })).toBeVisible()
  await page.getByRole('button', { name: 'Desfazer conclusão' }).click()
  await expect(finish).toBeVisible()
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /vazia/)
  await page.reload()
  await page.getByRole('button', { name: /^Continuar / }).click()
  await expect(finish).toBeVisible()
  await finish.click()
  await expect(page.getByRole('dialog', { name: 'Grade concluída' })).toBeVisible()
})

test('automatic finish keeps the board stable and remains reachable on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const state = createGameState(puzzleWithGivens(SOLUTION.map((value, index) => index < 11 ? 0 : value)), { now: Date.now() })
  await start(page, state, { theme: 'dark', highContrast: true, reduceMotion: true })
  const before = await page.getByRole('grid').boundingBox()
  await cell(page, 10).click()
  await digit(page, SOLUTION[10]!).click()
  expect(await page.getByRole('grid').boundingBox()).toEqual(before)
  const finish = page.getByRole('button', { name: 'Concluir as 10 casas restantes' })
  await finish.scrollIntoViewIfNeeded()
  await expect(finish).toBeInViewport()
  await expect(page.locator('#auto-finish-description')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('auto-finish-narrow.png') })
  await finish.click()
  await expect(page.getByRole('dialog', { name: 'Grade concluída' })).toBeVisible()
})

const browserErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    // WebKit reports this unsupported optional Chromium viewport hint as an
    // error; it is unrelated to JavaScript or input handling.
    if (message.text() === 'Viewport argument key "interactive-widget" not recognized and ignored.') return
    if (message.type() === 'error') errors.push(message.text())
  })
})
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([])
})

async function center(page: Page, index: number) {
  const box = await cell(page, index).boundingBox()
  if (!box) throw new Error('Cell is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function selected(page: Page) {
  return page.getByRole('gridcell').evaluateAll((cells) => cells.flatMap(
    (cell, index) => cell.getAttribute('aria-selected') === 'true' ? [index] : [],
  ))
}

test('a drag replaces the old selection and includes its starting cell', async ({ page }) => {
  await start(page)
  await cell(page, 80).click()
  const from = await center(page, 10)
  const to = await center(page, 11)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  expect(await selected(page)).toEqual([10, 11])
  await digit(page, 4).click()
  await expect(cell(page, 10)).toContainText('4')
  await expect(cell(page, 11)).toContainText('4')
  await expect(cell(page, 80)).not.toContainText('4')
})

test('dragging from outside the board cannot extend the selection', async ({ page }) => {
  await start(page)
  await cell(page, 80).click()
  const to = await center(page, 0)
  await page.mouse.move(to.x, to.y - 90)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  expect(await selected(page)).toEqual([80])
})

test('keyboard input keeps working after using tools and the number pad', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await page.getByRole('radio', { name: 'Canto', exact: true }).click()
  await page.keyboard.press('3')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /marcas de canto 3/)
  await page.getByRole('radio', { name: 'Número', exact: true }).click()
  await digit(page, 4).click()
  await page.keyboard.press('5')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 5/)
  await page.keyboard.press('Control+z')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await page.keyboard.press('Control+Shift+z')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 5/)
})

test('holding a digit or a mode shortcut does not toggle the input repeatedly', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await page.keyboard.down('4')
  await page.keyboard.down('4')
  await page.keyboard.up('4')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await page.keyboard.down('Space')
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  await expect(page.getByRole('radio', { name: 'Canto', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('Shift plus a number creates a corner note on keyboards that emit symbols', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await page.keyboard.press('Shift+Digit3')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /marcas de canto 3/)
  await expect(cell(page, 10)).not.toHaveAttribute('aria-label', /valor/)
})

test('a completed digit remains available to correct and toggle an entry', async ({ page }) => {
  const state = createGameState(puzzleWithGivens(), { now: Date.now() })
  for (let index = 0; index < 9; index++) state.cells[index]!.value = 4
  await start(page, state)
  await cell(page, 0).click()
  await expect(digit(page, 4)).toBeEnabled()
  await digit(page, 4).click()
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /vazia/)
})

test('range selection ends at the clicked cell in every direction', async ({ page }) => {
  await start(page)
  await cell(page, 20).click()
  await cell(page, 10).click({ modifiers: ['Shift'] })
  expect(await selected(page)).toEqual([10, 11, 19, 20])
  await expect(cell(page, 10)).toHaveAttribute('data-anchor', 'true')
  await page.keyboard.press('ArrowLeft')
  expect(await selected(page)).toEqual([9])
})

test('on-demand errors stay hidden until checking is requested', async ({ page }) => {
  await start(page, undefined, { errorPolicy: 'on-demand' })
  await cell(page, 0).click()
  await digit(page, 4).click()
  await cell(page, 1).click()
  await digit(page, 4).click()
  await expect(page.locator('[data-conflict]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Opções da partida' }).click()
  await page.getByRole('button', { name: /Verificar grade/ }).click()
  await expect(page.locator('[data-conflict]')).not.toHaveCount(0)
  await cell(page, 1).click()
  await digit(page, 2).click()
  await expect(page.locator('[data-conflict]')).toHaveCount(0)
})

test('Ctrl-click toggles once and an ordinary click clears a multi-selection', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await cell(page, 11).click({ modifiers: ['Control'] })
  expect(await selected(page)).toEqual([10, 11])
  await cell(page, 10).click({ modifiers: ['Control'] })
  expect(await selected(page)).toEqual([11])
  await cell(page, 11).click({ modifiers: ['Control'] })
  expect(await selected(page)).toEqual([])
  await expect(page.locator('.sudoku-cell[tabindex="0"]')).toHaveCount(1)
  await cell(page, 20).click()
  await digit(page, 7).click()
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /vazia/)
  await expect(cell(page, 20)).toHaveAttribute('aria-label', /valor 7/)
})

test('repeated Shift-click ranges retain their origin', async ({ page }) => {
  await start(page)
  await cell(page, 20).click()
  await cell(page, 10).click({ modifiers: ['Shift'] })
  await cell(page, 19).click({ modifiers: ['Shift'] })
  expect(await selected(page)).toEqual([19, 20])
  await expect(cell(page, 19)).toHaveAttribute('data-anchor', 'true')
})

test('notes, colors, erase, undo and redo affect only the intended layers', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await page.getByRole('radio', { name: 'Canto', exact: true }).click()
  await digit(page, 3).click()
  await page.getByRole('radio', { name: 'Centro', exact: true }).click()
  await digit(page, 5).click()
  await page.getByRole('radio', { name: 'Cor', exact: true }).click()
  await page.locator('.color-key').nth(1).click()
  await expect(cell(page, 10)).toHaveAttribute('data-color', 'sky')
  await page.getByRole('button', { name: 'Apagar', exact: true }).click()
  await expect(cell(page, 10)).not.toHaveAttribute('data-color')
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /canto 3, marcas centrais 5/)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(cell(page, 10)).toHaveAttribute('data-color', 'sky')
  await page.getByRole('radio', { name: 'Número', exact: true }).click()
  await digit(page, 2).click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 2/)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /canto 3, marcas centrais 5/)
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 2/)
  await expect(cell(page, 10)).toHaveAttribute('data-color', 'sky')
})

test('keyboard navigation followed immediately by a tool click keeps the correct target', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await page.keyboard.press('ArrowRight')
  await expect(cell(page, 11)).toBeFocused()
  await page.getByRole('radio', { name: 'Centro', exact: true }).click()
  await page.keyboard.press('7')
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /marcas centrais 7/)
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /vazia/)
})

test('pause and menus block gameplay and release the board when closed', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await digit(page, 4).click()
  await page.getByRole('button', { name: /^Pausar/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('5')
  await page.keyboard.press('Control+z')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await page.getByRole('button', { name: 'Opções da partida' }).click()
  await page.keyboard.press('6')
  await page.keyboard.press('Escape')
  await cell(page, 11).click()
  await digit(page, 7).click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /valor 7/)
})

test('a hint applies only its displayed target even after changing selection and tool', async ({ page }) => {
  const givens = [...SOLUTION]
  givens[0] = 0
  givens[10] = 0
  await start(page, createGameState(puzzleWithGivens(givens), { now: Date.now() }))
  await page.getByRole('button', { name: 'Dica', exact: true }).click()
  await page.getByRole('button', { name: 'Mostrar a região' }).click()
  await page.getByRole('button', { name: 'Explicar o padrão' }).click()
  await page.getByRole('button', { name: 'Mostrar o passo' }).click()
  await cell(page, 10).click()
  await page.getByRole('radio', { name: 'Cor', exact: true }).click()
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /valor 1/)
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /vazia/)
})

test('a conflict hint closes without inserting a number', async ({ page }) => {
  await start(page)
  await cell(page, 0).click()
  await digit(page, 4).click()
  await cell(page, 1).click()
  await digit(page, 4).click()
  await page.getByRole('button', { name: 'Dica', exact: true }).click()
  await page.getByRole('button', { name: 'Mostrar a região' }).click()
  await page.getByRole('button', { name: 'Explicar o padrão' }).click()
  await page.getByRole('button', { name: 'Mostrar o passo' }).click()
  await page.getByRole('button', { name: 'Entendi', exact: true }).click()
  await expect(page.locator('.hint-panel')).toHaveCount(0)
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /valor 4/)
  await expect(cell(page, 1)).toHaveAttribute('aria-label', /valor 4/)
})

test('autosave restores selection, tool, values, notes and undo after reload', async ({ page }) => {
  await start(page)
  await cell(page, 10).click()
  await digit(page, 4).click()
  await cell(page, 11).click()
  await page.getByRole('radio', { name: 'Centro', exact: true }).click()
  await digit(page, 7).click()
  // Exercise pagehide while an autosave may still be pending.
  await page.getByRole('button', { name: 'Voltar ao início', exact: true }).click()
  await page.reload()
  await page.locator('.resume-action').click()
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /marcas centrais 7/)
  expect(await selected(page)).toEqual([11])
  await expect(page.getByRole('radio', { name: 'Centro', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /vazia/)
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
})

test('touch taps select exactly one cell and enter the tapped digit once', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Requires touch input')
  await start(page)
  await cell(page, 10).tap()
  await digit(page, 4).tap()
  await cell(page, 11).tap()
  await digit(page, 7).tap()
  expect(await selected(page)).toEqual([11])
  await expect(cell(page, 10)).toHaveAttribute('aria-label', /valor 4/)
  await expect(cell(page, 11)).toHaveAttribute('aria-label', /valor 7/)
})

test('small pointer jitter across a cell edge does not select a second cell', async ({ page }) => {
  await start(page)
  const box = (await cell(page, 10).boundingBox())!
  const edge = box.x + box.width
  await page.mouse.move(edge - 2, box.y + box.height / 2)
  await page.mouse.down()
  expect(await selected(page)).toEqual([10])
  await page.mouse.move(edge + 2, box.y + box.height / 2)
  await page.mouse.up()
  expect(await selected(page)).toEqual([10])
})

test('releasing outside the board ends a drag before the next pointer action', async ({ page }) => {
  await start(page)
  const from = await center(page, 0)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y - 30)
  await page.mouse.up()
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + 40)
  await page.mouse.up()
  expect(await selected(page)).toEqual([0])
  await cell(page, 20).click()
  expect(await selected(page)).toEqual([20])
})

test('touch dragging and cancellation never carry a selection into the next gesture', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Uses Chromium touch protocol')
  await start(page)
  await cell(page, 80).tap()
  const session = await page.context().newCDPSession(page)
  const from = await center(page, 10)
  const to = await center(page, 11)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await selected(page)).toEqual([10, 11])
  await digit(page, 4).tap()
  await expect(cell(page, 80)).toHaveAttribute('aria-label', /vazia/)
  const next = await center(page, 20)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...next, id: 1 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await cell(page, 30).tap()
  await digit(page, 7).tap()
  expect(await selected(page)).toEqual([30])
  await expect(cell(page, 20)).toHaveAttribute('aria-label', /vazia/)
  await expect(cell(page, 30)).toHaveAttribute('aria-label', /valor 7/)
})

test('completion-only validation appears when full and hides after erasing', async ({ page }) => {
  const state = createGameState(puzzleWithGivens(), { now: Date.now() })
  state.cells = state.cells.map((cell, index) => ({
    ...cell, value: index === 80 ? null : 1,
  }))
  await start(page, state, { errorPolicy: 'completion' })
  await expect(page.locator('[data-conflict]')).toHaveCount(0)
  await cell(page, 80).click()
  await digit(page, 2).click()
  await expect(page.locator('[data-conflict]')).not.toHaveCount(0)
  await page.getByRole('button', { name: 'Apagar', exact: true }).click()
  await expect(page.locator('[data-conflict]')).toHaveCount(0)
})
