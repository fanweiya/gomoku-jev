import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAiConfig } from '../src/game/AiConfig';

// 模型兜底按 providerId 解析：subq 空模型补 subq-snap-1.2 而非
// jev-preview；custom 空模型保持为空（由调用方报错），不做替换。
describe('loadAiConfig model fallback', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
  });

  it('resolves the empty model from the stored provider preset', () => {
    store.set(
      'gomoku_jev_ai_config',
      JSON.stringify({ providerId: 'subq', endpoint: '', model: '', apiKey: '' }),
    );
    expect(loadAiConfig().model).toBe('subq-snap-1.2');
  });

  it('keeps an empty custom model empty instead of substituting jev-preview', () => {
    store.set(
      'gomoku_jev_ai_config',
      JSON.stringify({ providerId: 'custom', endpoint: 'https://example.com/v1', model: '', apiKey: '' }),
    );
    const config = loadAiConfig();
    expect(config.model).toBe('');
    expect(config.providerId).toBe('custom');
  });

  it('keeps an explicitly stored model untouched', () => {
    store.set(
      'gomoku_jev_ai_config',
      JSON.stringify({ providerId: 'codiv', endpoint: '', model: 'openjev-0.1', apiKey: '' }),
    );
    expect(loadAiConfig().model).toBe('openjev-0.1');
  });
});
