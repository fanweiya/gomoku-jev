import { beforeEach, describe, expect, it, vi } from 'vitest';

// JevClient 使用浏览器 fetch；在 Node 测试环境里注入可控替身，
// 按用例验证请求构造、响应解析与超时降级三条路径。
// vi.stubGlobal 会被 hoisted 到文件顶部，先于 JevClient 的模块初始化。
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { chooseAiMove } from "../src/game/JevClient";

const CANDIDATES = [
  { row: 7, col: 7, key: "H8", description: "center point" },
  { row: 7, col: 8, key: "I8", description: "side point" },
];

describe("chooseAiMove", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });
  it('returns the fallback choice for an empty candidate list', async () => {
    const choice = await chooseAiMove('board', []);
    expect(choice.source).toBe('fallback');
    expect(choice.row).toBe(-1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a choice question built from the candidates', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      answers: { next_move: { choice: 'I8', confidence: 0.42, probabilities: { H8: 0.3, I8: 0.7 } } },
    }), { status: 200 }));
    const choice = await chooseAiMove('X O .', CANDIDATES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/jev');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body);
    expect(payload.model).toBe('jev-latest');
    expect(payload.questions.next_move.criteria).toEqual({ H8: 'center point', I8: 'side point' });
    expect(payload.state.candidate_keys).toEqual(['H8', 'I8']);
    expect(choice).toMatchObject({ row: 7, col: 8, key: 'I8', confidence: 0.42, source: 'jev' });
    expect(choice.probabilities).toEqual({ H8: 0.3, I8: 0.7 });
  });

  it('falls back to the first candidate on HTTP failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const choice = await chooseAiMove('board', CANDIDATES);
    expect(choice.source).toBe('fallback');
    expect(choice.key).toBe('H8');
    expect(choice.confidence).toBe(0);
  });

  it('falls back when the model answers with an unknown key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      answers: { next_move: { choice: 'ZZ9', confidence: 0.9 } },
    }), { status: 200 }));
    const choice = await chooseAiMove('board', CANDIDATES);
    expect(choice.source).toBe('fallback');
    expect(choice.key).toBe('H8');
  });

  it('falls back when the request rejects (timeout or network)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('aborted'));
    const choice = await chooseAiMove('board', CANDIDATES);
    expect(choice.source).toBe('fallback');
    expect(choice.key).toBe('H8');
  });

  it('falls back when the response body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>proxy error</html>', { status: 200 }));
    const choice = await chooseAiMove('board', CANDIDATES);
    expect(choice.source).toBe('fallback');
    expect(choice.key).toBe('H8');
  });
});
