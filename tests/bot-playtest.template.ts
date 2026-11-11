import { expect, test } from '@playwright/test';

// Copy this file to tests/bot-playtest.spec.ts to enable automated playtests.
// The bot drives real input through the board center: human stones must register,
// the AI must answer with its own stone (proxy fallback keeps it offline-safe),
// and the run must finish without console or page errors.
//
// Requires window.__THREE_GAME_DIAGNOSTICS__ (frame/moves/turn) — present in dev builds.

const CENTER_OFFSETS: Array<[number, number]> = [
  [0, 0], [0, 40], [40, 0], [-40, -40], [40, 40],
];

test('bot playtest: scripted clicks progress the game without errors', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chrome',
    'Canvas coordinate clicks assume the desktop viewport; touch input is exercised by visual.spec.ts.',
  );
  test.setTimeout(60_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const moves = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.moves ?? -1);
  const turn = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.turn ?? '');

  let previousMoves = await moves();
  for (const [dx, dy] of CENTER_OFFSETS) {
    // 每次点击棋盘中心附近的空点，等待回合从 human → ai → human 完成一次循环。
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await expect.poll(turn, { timeout: 15_000 }).toBe('human');
    const currentMoves = await moves();
    expect(currentMoves).toBeGreaterThan(previousMoves);
    previousMoves = currentMoves;
  }

  // 每个循环产生两枚棋子（人 + AI），四轮后至少 8 手。
  expect(previousMoves).toBeGreaterThanOrEqual(8);

  await page.screenshot({ fullPage: true, path: testInfo.outputPath('bot-playtest.png') });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
