import { describe, expect, it } from 'vitest';

import { ALLOWED_UPSTREAM_HOSTS, FORBIDDEN_HEADERS, allowsServerKey, isAllowedUpstream } from '../functions/api/upstream-allowlist';
import { PROVIDER_PRESETS } from '../src/game/AiConfig';

// 代理转发规则的安全边界：服务端密钥只允许流向预设上游，
// 客户端自定义请求头不允许覆盖鉴权与逐跳头。
describe('isAllowedUpstream', () => {
  it('accepts every non-custom provider preset endpoint', () => {
    const presets = PROVIDER_PRESETS.filter((p) => p.endpoint !== '');
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(isAllowedUpstream(preset.endpoint)).toBe(true);
    }
  });

  it('rejects arbitrary hosts, insecure schemes and malformed urls', () => {
    const rejected = [
      'https://attacker.example/v1/systemone',
      'http://api.typesafe.ai/v1/systemone',
      'https://api.typesafe.ai.evil.com/v1/systemone',
      'https://evil.com/?next=https://api.typesafe.ai/',
      'https://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'not a url',
      '',
    ];
    for (const endpoint of rejected) {
      expect(isAllowedUpstream(endpoint)).toBe(false);
    }
  });
});

describe('allowsServerKey', () => {
  it('allows only the exact public Clef endpoint, not any api.cloudflare.com path', () => {
    const clef = PROVIDER_PRESETS.find((p) => p.id === 'cf-clef');
    expect(clef).toBeDefined();
    expect(allowsServerKey(clef!.endpoint)).toBe(true);
    for (const endpoint of [
      'https://api.cloudflare.com/client/v4/accounts/b9b1998c78f49ed2e0db3ab8e868ff85/ai/run/@cf/meta/llama-3-8b-instruct',
      'https://api.cloudflare.com/client/v4/accounts/00000000000000000000000000000000/ai/run/@cf/cloudflare/clef-flash',
      'https://api.cloudflare.com/',
      'https://api.typesafe.ai/v1/systemone',
    ]) {
      expect(allowsServerKey(endpoint)).toBe(false);
    }
  });
});

describe('FORBIDDEN_HEADERS', () => {
  it('blocks auth, hop-by-hop and cookie headers case-insensitively', () => {
    for (const name of ['Authorization', 'authorization', 'HOST', 'Content-Type', 'Cookie', 'Transfer-Encoding']) {
      expect(FORBIDDEN_HEADERS.has(name.toLowerCase())).toBe(true);
    }
  });

  it('keeps provider-specific headers usable', () => {
    for (const name of ['TypeSafe-Danger-Zone-Images', 'X-API-Key', 'User-Agent']) {
      expect(FORBIDDEN_HEADERS.has(name.toLowerCase())).toBe(false);
    }
  });

  it('lists hostnames as bare hosts without scheme or port', () => {
    for (const host of ALLOWED_UPSTREAM_HOSTS) {
      expect(host).not.toContain('://');
      expect(host).not.toContain('/');
      expect(host).not.toContain(':');
    }
  });
});
