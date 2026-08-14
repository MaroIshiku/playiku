import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('first run, games, accounts, accessibility, themes, daily play, and offline shell', async ({ page, context }, testInfo) => {
  await page.addInitScript({ content: axeSource });
  await page.goto('/');
  const setup = page.getByRole('heading', { name: 'Set up Playiku' });
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).name).toBe('Playiku — Casual Games');
  const serviceWorker = await page.request.get('/sw.js');
  expect(serviceWorker.ok()).toBeTruthy();
  expect(await serviceWorker.text()).toContain("const CACHE = 'playiku-shell-v2'");
  if (await setup.isVisible()) { await page.getByLabel('Display name').fill('E2E Admin'); await page.getByLabel('Username').fill('e2e-admin'); await page.getByLabel('One-time setup secret').fill('synthetic-e2e-setup-material-2026-0001'); await page.getByLabel('Administrator password').fill('synthetic-e2e-password'); await page.getByRole('button', { name: 'Create administrator' }).click(); }
  else { await page.getByLabel('Username').fill('e2e-admin'); await page.getByLabel('Password').fill('synthetic-e2e-password'); await page.getByRole('button', { name: 'Sign in' }).click(); }
  await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
  await expect(page.locator('.game-card-main').filter({ hasText: 'Sudoku' }).first()).toBeVisible();
  const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string | null }[] }> } }).axe.run()).violations);
  expect(violations, JSON.stringify(violations)).toEqual([]);
  if (testInfo.project.name === 'desktop-chromium') { mkdirSync('test-results/visuals', { recursive: true }); const viewports = [{ name: '390x844', width: 390, height: 844 }, { name: '412x915', width: 412, height: 915 }, { name: '768x1024', width: 768, height: 1024 }, { name: '1440x900', width: 1440, height: 900 }, { name: '1920x1080', width: 1920, height: 1080 }]; for (const viewport of viewports) for (const theme of ['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite']) for (const mode of ['light', 'dark']) { await page.setViewportSize(viewport); await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; document.documentElement.dataset.resolvedMode = mode; }, { theme, mode }); await page.screenshot({ path: `test-results/visuals/home-${viewport.name}-${theme}-${mode}.png`, fullPage: true }); } }
  await page.locator('.game-card-main').filter({ hasText: '2048' }).first().click();
  await expect(page.getByLabel('2048 board. Use arrow keys or swipe.')).toBeVisible();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500);
  const normal2048 = ((await (await page.request.get('/api/state')).json()) as { activeSessions: { gameId: string; state: unknown }[] }).activeSessions.find((session) => session.gameId === '2048')?.state;
  expect(normal2048).toBeTruthy();
  const gameChecks = [
    { name: '2048', label: '2048 board. Use arrow keys or swipe.', daily: true },
    { name: 'Sudoku', label: 'Sudoku board', daily: true },
    { name: 'Minesweeper', label: 'Minesweeper board', daily: true },
    { name: 'Nonogram', label: 'Nonogram board', daily: true },
    { name: 'Snake', label: 'Snake board. Use arrow keys, WASD, swipe, or the direction buttons.', daily: false },
    { name: 'Solitaire', label: 'Klondike Solitaire board', daily: false }
  ];
  for (const [index, game] of gameChecks.entries()) {
    if (index > 0) await page.locator('.game-card-main').filter({ hasText: game.name }).first().click();
    await expect(page.getByLabel(game.label)).toBeVisible();
    const gameViolations = await page.evaluate(async () => (await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string | null }[] }> } }).axe.run()).violations);
    expect(gameViolations, `${game.name}: ${JSON.stringify(gameViolations)}`).toEqual([]);
    await page.getByRole('button', { name: 'How to play' }).click();
    await expect(page.getByRole('dialog', { name: `How to play ${game.name}` })).toBeVisible();
    const dialogViolations = await page.evaluate(async () => (await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string }[] }> } }).axe.run()).violations);
    expect(dialogViolations, `${game.name} tips: ${JSON.stringify(dialogViolations)}`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (testInfo.project.name === 'desktop-chromium') { for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) { await page.setViewportSize(viewport); await page.screenshot({ path: `test-results/visuals/game-${game.name.toLowerCase()}-${viewport.name}.png`, fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); } }
    if (game.name === 'Minesweeper') { await page.getByLabel('Difficulty').selectOption('Custom'); await expect(page.locator('.mine-cell')).toHaveCount(144); await page.locator('.mine-cell').first().click(); await expect(page.locator('.mine-cell').first()).not.toHaveAttribute('aria-label', 'Mine'); }
    if (game.name === 'Nonogram') { const cells = page.locator('.nono-cell'); await cells.first().hover(); await page.mouse.down(); await cells.nth(2).hover(); await page.mouse.up(); expect(await page.locator('.nono-cell.mark-1').count()).toBeGreaterThanOrEqual(2); await page.getByRole('button', { name: 'Undo' }).click(); await page.getByRole('button', { name: 'Hint' }).click(); await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); await page.getByRole('button', { name: 'Undo' }).click(); }
    if (game.name === 'Solitaire') { expect(await page.locator('.tableau-column').evaluateAll((columns) => columns.every((column) => { const cards = [...column.querySelectorAll('.tableau-card')]; return cards.length > 0 && !cards.at(-1)?.classList.contains('card-back') && cards.slice(0, -1).every((card) => card.classList.contains('card-back')); }))).toBe(true); }
    if (game.daily) { await page.getByRole('button', { name: 'Daily challenge' }).click(); await expect(page.locator('.game-header h1')).toContainText('Daily'); }
    if (game.name === '2048') { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500); const afterDaily = ((await (await page.request.get('/api/state')).json()) as { activeSessions: { gameId: string; state: unknown }[] }).activeSessions.find((session) => session.gameId === '2048')?.state; expect(afterDaily).toEqual(normal2048); }
    await page.getByRole('button', { name: 'Back to games' }).click();
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('navigation', { name: 'Profile' }).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  const accountUsername = `family-${testInfo.project.name}`;
  await page.locator('.account-form').getByLabel('Display name').fill('Family Player');
  await page.locator('.account-form').getByLabel('Username').fill(accountUsername);
  await page.locator('.account-form').getByLabel('Initial password').fill('synthetic-family-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('.account-list')).toContainText(`@${accountUsername}`);
  await page.getByRole('button', { name: 'Delete statistics' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete statistics?' })).toBeVisible();
  if (testInfo.project.name === 'desktop-chromium') await page.screenshot({ path: 'test-results/visuals/settings-confirmation-dialog.png', fullPage: true });
  if (testInfo.project.name === 'desktop-chromium') {
    await page.getByLabel('Current password').fill('incorrect-password');
    await page.getByRole('button', { name: 'Delete data' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  }
  await page.getByLabel('Current password').fill('synthetic-e2e-password');
  await page.getByRole('button', { name: 'Delete data' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Game data deleted');
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('navigation', { name: 'Profile' }).getByRole('button', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  await expect(page.locator('.session-list')).toContainText('This device');
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  if (testInfo.project.name === 'desktop-chromium') { await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible(); await context.setOffline(true); await page.reload(); await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible(); await page.locator('.game-card-main').filter({ hasText: 'Sudoku' }).first().click(); await expect(page.getByLabel('Sudoku board')).toBeVisible(); await context.setOffline(false); }
});
