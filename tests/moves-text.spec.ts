import { expect, test } from '@playwright/test';
import { formatMovesText } from '../src/game/GomokuCore';

// 棋谱生成是纯函数单测，不需要页面；覆盖「按实际 color 与落子顺序标注」口径。
const B = (row: number, col: number) => ({ row, col, color: 1 as const });
const W = (row: number, col: number) => ({ row, col, color: 2 as const });

test('正常交替对局：输出与旧格式一致', () => {
  const history = [B(7, 7), W(8, 8), B(7, 8), W(8, 7)];
  expect(formatMovesText(history)).toBe('1. 黑 H8 · 白 I9  2. 黑 I8 · 白 H9');
});

test('非交替历史：AI 未落子、人类连下两手，后续标注不被错位', () => {
  // 旧的下标配对会输出「1. 黑 H8 · 白 I8  2. 黑 I9」——把人类的 I8 标成白、
  // AI 的 I9 标成黑；按 color 生成后每步颜色与实际一致。
  const history = [B(7, 7), B(7, 8), W(8, 8)];
  expect(formatMovesText(history)).toBe('1. 黑 H8  2. 黑 I8 · 白 I9');
});

test('白步多于黑步时同样按 color 标注', () => {
  const history = [B(7, 7), W(8, 8), W(9, 9)];
  expect(formatMovesText(history)).toBe('1. 黑 H8 · 白 I9  2. 白 J10');
});

test('只有黑步与空历史', () => {
  expect(formatMovesText([B(0, 0)])).toBe('1. 黑 A1');
  expect(formatMovesText([])).toBe('');
});
