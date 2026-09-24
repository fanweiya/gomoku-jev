export interface MoveChoice {
  row: number;
  col: number;
  key: string;
  confidence: number;
  source: 'jev' | 'fallback';
  probabilities: Record<string, number>;
}

export interface CandidateMove {
  row: number;
  col: number;
  key: string;
  description: string;
}

export async function chooseAiMove(
  boardString: string,
  candidates: { row: number; col: number; key: string; description: string; }[]
): Promise<MoveChoice> {
  if (!candidates || candidates.length === 0) {
    return {
      row: -1,
      col: -1,
      key: '',
      confidence: 0,
      source: 'fallback',
      probabilities: {},
    };
  }

  const fallbackChoice: MoveChoice = {
    row: candidates[0].row,
    col: candidates[0].col,
    key: candidates[0].key,
    confidence: 0,
    source: 'fallback',
    probabilities: {},
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const criteria: Record<string, string> = {};
    for (const item of candidates) {
      criteria[item.key] = item.description || item.key;
    }

    const payload = {
      model: 'jev-latest',
      state: {
        board_size: 15,
        board: boardString,
        description: '五子棋对局：AI执白棋后手，人类玩家执黑棋先手刚完成下子',
        candidate_keys: candidates.map((item) => item.key),
        candidates: candidates.map((item) => ({
          row: item.row,
          col: item.col,
          key: item.key,
          description: item.description,
        })),
      },
      questions: {
        next_move: {
          type: 'choice',
          instructions: '评估五子棋当前盘面，在提供的候选位置中选择胜率最高的位置。',
          criteria,
        },
      },
    };

    const response = await fetch('/api/jev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallbackChoice;
    }

    const data = await response.json();
    const chosenKey = data?.answers?.next_move?.choice;
    const selected = candidates.find((item) => item.key === chosenKey);

    if (selected) {
      const confidence = typeof data?.answers?.next_move?.confidence === 'number'
        ? data.answers.next_move.confidence
        : 0;

      const probabilities = (data?.answers?.next_move?.probabilities && typeof data.answers.next_move.probabilities === 'object')
        ? (data.answers.next_move.probabilities as Record<string, number>)
        : {};

      return {
        row: selected.row,
        col: selected.col,
        key: selected.key,
        confidence,
        source: 'jev',
        probabilities,
      };
    }

    return fallbackChoice;
  } catch {
    return fallbackChoice;
  } finally {
    clearTimeout(timeoutId);
  }
}
