export type Cell = 0 | 1 | 2;
export type Board = Cell[][];
export const SIZE = 15;

const DIRECTIONS: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];

export function createBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < SIZE; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < SIZE; c++) {
      row.push(0);
    }
    board.push(row);
  }
  return board;
}

export function cellKey(row: number, col: number): string {
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return '';
  }
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
    return '';
  }
  const colLetter = String.fromCharCode(65 + col);
  const rowNumber = (row + 1).toString();
  return `${colLetter}${rowNumber}`;
}

export function parseKey(key: string): { row: number; col: number } | null {
  if (typeof key !== 'string') {
    return null;
  }
  const match = key.trim().match(/^([A-Oa-o])([1-9]|1[0-5])$/);
  if (!match) {
    return null;
  }
  const col = match[1].toUpperCase().charCodeAt(0) - 65;
  const row = parseInt(match[2], 10) - 1;
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
    return null;
  }
  return { row, col };
}

export function checkWin(board: Board, row: number, col: number): boolean {
  if (!Array.isArray(board) || !Number.isInteger(row) || !Number.isInteger(col)) {
    return false;
  }
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
    return false;
  }
  const currentRow = board[row];
  if (!currentRow) {
    return false;
  }
  const color = currentRow[col];
  if (color !== 1 && color !== 2) {
    return false;
  }

  for (let d = 0; d < DIRECTIONS.length; d++) {
    const [dr, dc] = DIRECTIONS[d];
    let count = 1;

    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r]?.[c] === color) {
      count++;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r]?.[c] === color) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= 5) {
      return true;
    }
  }

  return false;
}

export function isBoardFull(board: Board): boolean {
  if (!Array.isArray(board) || board.length < SIZE) {
    return false;
  }
  for (let r = 0; r < SIZE; r++) {
    const row = board[r];
    if (!Array.isArray(row) || row.length < SIZE) {
      return false;
    }
    for (let c = 0; c < SIZE; c++) {
      if (row[c] === 0) {
        return false;
      }
    }
  }
  return true;
}

export function boardToString(board: Board): string {
  if (!Array.isArray(board)) {
    return '';
  }
  const lines: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    const row = board[r];
    let line = '';
    for (let c = 0; c < SIZE; c++) {
      const cell = row ? row[c] : 0;
      if (cell === 1) {
        line += 'X';
      } else if (cell === 2) {
        line += 'O';
      } else {
        line += '.';
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export interface Candidate {
  row: number;
  col: number;
  key: string;
  score: number;
  description: string;
}

interface DirectionPattern {
  five: boolean;
  openFour: boolean;
  rushFour: boolean;
  openThree: boolean;
  sleepingThree: boolean;
  openTwo: boolean;
}

interface PatternCounts {
  five: number;
  openFour: number;
  rushFour: number;
  openThree: number;
  sleepingThree: number;
  openTwo: number;
}

function extractLine(board: Board, row: number, col: number, dr: number, dc: number, testColor: Cell): number[] {
  const line: number[] = new Array(9);
  for (let k = -4; k <= 4; k++) {
    if (k === 0) {
      line[k + 4] = testColor;
      continue;
    }
    const r = row + k * dr;
    const c = col + k * dc;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
      line[k + 4] = -1;
    } else {
      line[k + 4] = board[r]?.[c] ?? -1;
    }
  }
  return line;
}

function evaluateDirection(line: number[], testColor: Cell): DirectionPattern {
  let l = 4;
  while (l > 0 && line[l - 1] === testColor) {
    l--;
  }
  let r = 4;
  while (r < 8 && line[r + 1] === testColor) {
    r++;
  }
  const consec = r - l + 1;

  if (consec >= 5) {
    return {
      five: true,
      openFour: false,
      rushFour: false,
      openThree: false,
      sleepingThree: false,
      openTwo: false
    };
  }

  if (consec === 4) {
    const leftOpen = l > 0 && line[l - 1] === 0;
    const rightOpen = r < 8 && line[r + 1] === 0;
    if (leftOpen && rightOpen) {
      return {
        five: false,
        openFour: true,
        rushFour: false,
        openThree: false,
        sleepingThree: false,
        openTwo: false
      };
    }
    if (leftOpen || rightOpen) {
      return {
        five: false,
        openFour: false,
        rushFour: true,
        openThree: false,
        sleepingThree: false,
        openTwo: false
      };
    }
  }

  let rushFour = false;
  for (let s = 0; s <= 4; s++) {
    let colorCount = 0;
    let zeroCount = 0;
    let obstacle = false;
    for (let i = 0; i < 5; i++) {
      const v = line[s + i];
      if (v === testColor) {
        colorCount++;
      } else if (v === 0) {
        zeroCount++;
      } else {
        obstacle = true;
        break;
      }
    }
    if (!obstacle && colorCount === 4 && zeroCount === 1) {
      rushFour = true;
      break;
    }
  }

  if (rushFour) {
    return {
      five: false,
      openFour: false,
      rushFour: true,
      openThree: false,
      sleepingThree: false,
      openTwo: false
    };
  }

  let openThree = false;
  for (let s = 0; s <= 3; s++) {
    if (line[s] !== 0 || line[s + 5] !== 0) {
      continue;
    }
    let colorCount = 0;
    let zeroCount = 0;
    let obstacle = false;
    for (let i = 1; i <= 4; i++) {
      const v = line[s + i];
      if (v === testColor) {
        colorCount++;
      } else if (v === 0) {
        zeroCount++;
      } else {
        obstacle = true;
        break;
      }
    }
    if (!obstacle && colorCount === 3 && zeroCount === 1) {
      openThree = true;
      break;
    }
  }

  if (openThree) {
    return {
      five: false,
      openFour: false,
      rushFour: false,
      openThree: true,
      sleepingThree: false,
      openTwo: false
    };
  }

  let sleepingThree = false;
  for (let s = 0; s <= 4; s++) {
    let colorCount = 0;
    let zeroCount = 0;
    let obstacle = false;
    for (let i = 0; i < 5; i++) {
      const v = line[s + i];
      if (v === testColor) {
        colorCount++;
      } else if (v === 0) {
        zeroCount++;
      } else {
        obstacle = true;
        break;
      }
    }
    if (!obstacle && colorCount === 3 && zeroCount === 2) {
      sleepingThree = true;
      break;
    }
  }

  if (sleepingThree) {
    return {
      five: false,
      openFour: false,
      rushFour: false,
      openThree: false,
      sleepingThree: true,
      openTwo: false
    };
  }

  if (consec === 2) {
    const leftOpen = l > 0 && line[l - 1] === 0;
    const rightOpen = r < 8 && line[r + 1] === 0;
    if (leftOpen && rightOpen) {
      let canFormFive = false;
      for (let s = 0; s <= 4; s++) {
        if (s <= l && s + 4 >= r) {
          let obstacle = false;
          for (let i = 0; i < 5; i++) {
            const v = line[s + i];
            if (v !== testColor && v !== 0) {
              obstacle = true;
              break;
            }
          }
          if (!obstacle) {
            canFormFive = true;
            break;
          }
        }
      }
      if (canFormFive) {
        return {
          five: false,
          openFour: false,
          rushFour: false,
          openThree: false,
          sleepingThree: false,
          openTwo: true
        };
      }
    }
  }

  return {
    five: false,
    openFour: false,
    rushFour: false,
    openThree: false,
    sleepingThree: false,
    openTwo: false
  };
}

function collectPatterns(board: Board, row: number, col: number, testColor: Cell): PatternCounts {
  const counts: PatternCounts = {
    five: 0,
    openFour: 0,
    rushFour: 0,
    openThree: 0,
    sleepingThree: 0,
    openTwo: 0
  };

  for (let d = 0; d < DIRECTIONS.length; d++) {
    const [dr, dc] = DIRECTIONS[d];
    const line = extractLine(board, row, col, dr, dc, testColor);
    const pattern = evaluateDirection(line, testColor);
    if (pattern.five) counts.five++;
    if (pattern.openFour) counts.openFour++;
    if (pattern.rushFour) counts.rushFour++;
    if (pattern.openThree) counts.openThree++;
    if (pattern.sleepingThree) counts.sleepingThree++;
    if (pattern.openTwo) counts.openTwo++;
  }

  return counts;
}

function scoreCandidate(board: Board, row: number, col: number, aiColor: 2): { score: number; description: string } {
  const humanColor: Cell = 1;
  const my = collectPatterns(board, row, col, aiColor);
  const opp = collectPatterns(board, row, col, humanColor);

  let score = 0;
  let description = '';

  if (my.five > 0) {
    score = 100_000_000;
    description = 'win immediately with five in a row';
    return { score, description };
  }

  if (opp.five > 0) {
    score = 20_000_000;
    if (my.openFour > 0 || my.rushFour > 0) {
      score += 500_000;
      description = 'block opponent winning move and create four in a row';
    } else {
      description = 'block opponent winning five in a row';
    }
    return { score, description };
  }

  if (my.openFour > 0) {
    score = 5_000_000;
    description = 'win next turn with an open four';
    return { score, description };
  }

  if (my.rushFour >= 2) {
    score = 2_500_000;
    description = 'create double four threat';
    return { score, description };
  }
  if (my.rushFour >= 1 && my.openThree >= 1) {
    score = 2_000_000;
    description = 'create winning four-three double threat';
    return { score, description };
  }
  if (my.openThree >= 2) {
    score = 1_500_000;
    description = 'create double open three';
    return { score, description };
  }

  if (opp.openFour > 0) {
    score = 1_000_000;
    description = "block opponent's open four";
    return { score, description };
  }

  if (opp.rushFour >= 2) {
    score = 700_000;
    description = "block opponent's double four threat";
    return { score, description };
  }
  if (opp.rushFour >= 1 && opp.openThree >= 1) {
    score = 600_000;
    description = "block opponent's four-three threat";
    return { score, description };
  }
  if (opp.openThree >= 2) {
    score = 500_000;
    description = "block opponent's double open three";
    return { score, description };
  }

  if (my.rushFour > 0) {
    score = 250_000;
    description = 'create four in a row';
  } else if (opp.rushFour > 0) {
    score = 150_000;
    description = "block opponent's four in a row";
  } else if (my.openThree > 0) {
    score = 80_000;
    if (opp.openThree > 0) {
      score += 20_000;
      description = "build an open three and block opponent's open three";
    } else {
      description = 'build an open three';
    }
  } else if (opp.openThree > 0) {
    score = 50_000;
    description = "block opponent's open three";
  } else if (my.sleepingThree > 0) {
    score = 15_000;
    description = 'create a sleeping three';
  } else if (opp.sleepingThree > 0) {
    score = 10_000;
    description = "block opponent's sleeping three";
  } else if (my.openTwo > 0) {
    score = 4_000;
    if (my.openTwo >= 2) {
      score += 2_000;
      description = 'build double open two';
    } else {
      description = 'build an open two';
    }
  } else if (opp.openTwo > 0) {
    score = 2_000;
    description = "block opponent's open two";
  } else {
    score = 500;
    description = 'expand board presence';
  }

  const centerDistance = Math.max(Math.abs(row - 7), Math.abs(col - 7));
  const centerBonus = (7 - centerDistance) * 8;
  const secondaryBonus = (my.openTwo * 50) + (opp.openTwo * 30);

  score += centerBonus + secondaryBonus;

  return { score, description };
}

export function getCandidates(board: Board, aiColor: 2, max: number = 8): Candidate[] {
  if (!Array.isArray(board)) {
    return [];
  }

  const requestedMax = typeof max === 'number' ? max : 8;
  const limit = Math.min(Math.max(1, requestedMax), 10);

  let hasPieces = false;
  const candidateMap: boolean[][] = [];
  for (let r = 0; r < SIZE; r++) {
    candidateMap.push(new Array(SIZE).fill(false));
  }

  for (let r = 0; r < SIZE; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < SIZE; c++) {
      if (row[c] !== 0) {
        hasPieces = true;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
              if (board[nr]?.[nc] === 0) {
                candidateMap[nr][nc] = true;
              }
            }
          }
        }
      }
    }
  }

  if (!hasPieces) {
    return [
      {
        row: 7,
        col: 7,
        key: cellKey(7, 7),
        score: 1000,
        description: 'take board center H8 as opening move'
      }
    ];
  }

  const candidates: Candidate[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (candidateMap[r][c]) {
        const { score, description } = scoreCandidate(board, r, c, aiColor);
        candidates.push({
          row: r,
          col: c,
          key: cellKey(r, c),
          score,
          description
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const distA = Math.abs(a.row - 7) + Math.abs(a.col - 7);
    const distB = Math.abs(b.row - 7) + Math.abs(b.col - 7);
    if (distA !== distB) {
      return distA - distB;
    }
    if (a.row !== b.row) {
      return a.row - b.row;
    }
    return a.col - b.col;
  });

  return candidates.slice(0, limit);
}
