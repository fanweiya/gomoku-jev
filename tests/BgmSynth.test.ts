import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// BgmSynth 跑在浏览器里；在 Node 测试环境注入可控替身，复现
// 「两次 play() promise 同时结算」的泄漏场景：自动播放被允许但
// mp3 加载慢，期间发生首次手势或快速关-开 toggle，两个 play()
// promise 先后挂起、后一起结算（HTML 规范下第二次 play() 不会
// 中止第一个 promise）。
type Deferred = { promise: Promise<void>; resolve: () => void };

class FakeAudio {
  static instances: FakeAudio[] = [];
  volume = 0.38;
  loop = false;
  preload = '';
  paused = true;
  playDeferreds: Deferred[] = [];

  constructor(_src?: string) {
    FakeAudio.instances.push(this);
  }

  addEventListener(): void {}
  removeAttribute(): void {}
  load(): void {}

  play(): Promise<void> {
    this.paused = false;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const deferred = { promise, resolve };
    this.playDeferreds.push(deferred);
    return promise;
  }

  pause(): void {
    this.paused = true;
  }
}

vi.stubGlobal('Audio', FakeAudio);
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
vi.stubGlobal('window', {
  // 委托给全局定时器，vi.useFakeTimers() 才能接管。
  setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
  clearInterval: (...args: Parameters<typeof clearInterval>) => clearInterval(...args),
  setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
  addEventListener: () => {},
  removeEventListener: () => {},
});

import { AncientBgmSynth } from '../src/systems/BgmSynth';

describe('AncientBgmSynth 双 play() 淡入泄漏', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('两次 play() promise 同时结算只留一个淡入 interval，stop 后暂停', async () => {
    const synth = new AncientBgmSynth();
    const audio = FakeAudio.instances[0];

    // 两次 start() 各挂起一个 play() promise。
    synth.start();
    synth.start();
    expect(audio.playDeferreds).toHaveLength(2);

    // 两个 promise 一起结算 → fadeInAudio 被调两次。
    audio.playDeferreds[0].resolve();
    audio.playDeferreds[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 入口 stopFade() 保证同一时刻只有一个淡入 interval；
    // 否则先建的 interval 泄漏空转，淡出也被它清掉、audio 永远不 pause。
    expect(vi.getTimerCount()).toBe(1);

    // 淡入跑完（16 步 × 40ms），音量到达目标、interval 释放。
    await vi.advanceTimersByTimeAsync(16 * 40 + 100);
    expect(audio.volume).toBeCloseTo(0.38);
    expect(vi.getTimerCount()).toBe(0);

    // stop() 后淡出跑完（12 步 × 35ms），audio 暂停、音量复位。
    synth.stop();
    await vi.advanceTimersByTimeAsync(12 * 35 + 100);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBeCloseTo(0.38);
    expect(vi.getTimerCount()).toBe(0);
  });
});
