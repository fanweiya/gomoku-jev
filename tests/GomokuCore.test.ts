import { describe, expect, it } from 'vitest';
import {
  boardToString,
  cellKey,
  checkWin,
  createBoard,
  getCandidates,
  isBoardFull,
  type Board,
} from '../src/game/GomokuCore';

function place(board: Board, cells: [number, number][], color: 1 | 2): void {
  for (const [r, c] of cells) board[r][c] = color;
}

describe('cellKey', () => {
  it('maps coordinates to 15x15 letter/number keys', () => {
    expect(cellKey(0, 0)).toBe('A1');
    expect(cellKey(14, 14)).toBe('O15');
    expect(cellKey(7, 7)).toBe('H8');
  });

  it('returns empty string for out-of-range or non-integer input', () => {
    expect(cellKey(-1, 0)).toBe('');
    expect(cellKey(0, 15)).toBe('');
    expect(cellKey(1.5, 2)).toBe('');
    expect(cellKey(Number.NaN, 0)).toBe('');
  });
});

describe('checkWin', () => {
  it('detects five in all four directions', () => {
    const lines: [number, number][][] = [
      [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],
      [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]],
      [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]],
      [[7, 3], [6, 4], [5, 5], [4, 6], [3, 7]],
    ];
    for (const line of lines) {
      const board = createBoard();
      place(board, line, 1);
      expect(checkWin(board, line[2][0], line[2][1])).toBe(true);
    }
  });

  it('does not trigger on four in a row', () => {
    const board = createBoard();
    place(board, [[7, 3], [7, 4], [7, 5], [7, 6]], 2);
    expect(checkWin(board, 7, 6)).toBe(false);
  });

  it('ignores input outside the board', () => {
    const board = createBoard();
    expect(checkWin(board, -1, 0)).toBe(false);
    expect(checkWin(board, 0, 15)).toBe(false);
    expect(checkWin(board, Number.NaN, 0)).toBe(false);
  });
});

describe('isBoardFull', () => {
  it('is false for an empty board and true when all cells are set', () => {
    const board = createBoard();
    expect(isBoardFull(board)).toBe(false);
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        board[r][c] = (((r + c) % 2) + 1) as 1 | 2;
      }
    }
    expect(isBoardFull(board)).toBe(true);
  });
});

describe('boardToString', () => {
  it('uses X for black, O for white and . for empty', () => {
    const board = createBoard();
    place(board, [[0, 0], [14, 14]], 1);
    place(board, [[0, 1]], 2);
    const text = boardToString(board);
    expect(text.split('\n')).toHaveLength(15);
    expect(text.split('\n')[0].startsWith('XO.')).toBe(true);
    expect(text.split('\n')[14].endsWith('X')).toBe(true);
  });
});

describe('getCandidates', () => {
  it('opens at the center on an empty board', () => {
    const board = createBoard();
    const candidates = getCandidates(board, 2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].key).toBe('H8');
  });

  it('only proposes empty cells near existing stones', () => {
    const board = createBoard();
    place(board, [[7, 7]], 1);
    const candidates = getCandidates(board, 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(10);
    for (const candidate of candidates) {
      expect(board[candidate.row][candidate.col]).toBe(0);
      expect(Math.max(Math.abs(candidate.row - 7), Math.abs(candidate.col - 7))).toBeLessThanOrEqual(2);
    }
  });

  it('prefers an immediate win over everything else', () => {
    const board = createBoard();
    place(board, [[7, 3], [7, 4], [7, 5], [7, 6]], 2);
    place(board, [[8, 3], [8, 4], [8, 5], [8, 6]], 1);
    const candidates = getCandidates(board, 2);
    expect(candidates[0]).toMatchObject({ row: 7, col: 7 });
    expect(candidates[0].description).toContain('win immediately');
  });

  it('prefers blocking the opponent five over building own threats', () => {
    const board = createBoard();
    place(board, [[7, 3], [7, 4], [7, 5], [7, 6]], 1);
    place(board, [[10, 3], [10, 4]], 2);
    const candidates = getCandidates(board, 2);
    expect(candidates[0]).toMatchObject({ row: 7, col: 7 });
    expect(candidates[0].description).toContain('block');
  });
});
