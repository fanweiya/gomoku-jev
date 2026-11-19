export interface ProviderPreset {
  id: string;
  name: string;
  shortName: string;
  endpoint: string;
  defaultModel: string;
  models: string[];
  websiteUrl?: string;
  customHeaders: Record<string, string>;
  notes?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'typesafe',
    name: 'TypeSafe Jev (官方原版通道)',
    shortName: 'TypeSafe',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    defaultModel: 'jev-preview',
    models: ['jev-preview', 'jev-latest', 'jev-1.14.0'],
    websiteUrl: 'https://console.typesafe.ai',
    customHeaders: {
      'TypeSafe-Danger-Zone-Images': 'true',
    },
    notes: '官方原版通道，已配置专用请求头。',
  },
  {
    id: 'subq',
    name: 'SubQ (System One)',
    shortName: 'SubQ',
    endpoint: 'https://api.subq.ai/v1/systemone',
    defaultModel: 'subq-snap-1.1',
    models: ['subq-snap-1.1', 'subq-snap-preview'],
    websiteUrl: 'https://subq.ai',
    customHeaders: {},
    notes: 'SubQ 平台 System One 接口。',
  },
  {
    id: 'codiv',
    name: 'Codiv OpenJev (开源权重通道)',
    shortName: 'Codiv',
    endpoint: 'https://api.codiv.ai/v1/systemone',
    defaultModel: 'openjev-latest',
    models: ['openjev-latest', 'openjev-0.1'],
    websiteUrl: 'https://codiv.ai',
    customHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    },
    notes: '开源权重通道，已设置浏览器 User-Agent。',
  },
  {
    id: 'cf-clef',
    name: 'Cloudflare Workers AI Clef (边缘计算兜底)',
    shortName: 'CF Clef',
    endpoint: 'https://api.cloudflare.com/client/v4/accounts/b9b1998c78f49ed2e0db3ab8e868ff85/ai/run/@cf/cloudflare/clef-flash',
    defaultModel: 'clef-flash',
    models: ['clef-flash', 'clef', 'clef-omni'],
    websiteUrl: 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai',
    customHeaders: {},
    notes: 'Cloudflare Workers AI 边缘计算通道。',
  },
  {
    id: 'meragpt',
    name: 'MeraGPT',
    shortName: 'MeraGPT',
    endpoint: 'https://meragpt.com/v1/systemone',
    defaultModel: 'meragpt-latest',
    models: ['meragpt-latest', 'default'],
    websiteUrl: 'https://meragpt.com',
    customHeaders: {},
    notes: 'MeraGPT System One 接口。',
  },
  {
    id: 'nace',
    name: 'Nace AI',
    shortName: 'Nace AI',
    endpoint: 'https://console.nace.ai/v1/systemone',
    defaultModel: 'nace-latest',
    models: ['nace-latest', 'default'],
    websiteUrl: 'https://console.nace.ai',
    customHeaders: {},
    notes: 'Nace AI 平台通道。',
  },
  {
    id: 'custom',
    name: '自定义通道 (Custom)',
    shortName: '自定义',
    endpoint: '',
    defaultModel: '',
    models: [],
    customHeaders: {},
    notes: '可自主配置任意兼容接口地址、模型名称与请求密钥。',
  },
];

export interface UserAiConfig {
  providerId: string;
  providerName: string;
  shortName: string;
  endpoint: string;
  model: string;
  apiKey: string;
  customHeaders: Record<string, string>;
}

const STORAGE_KEY = 'gomoku_jev_ai_config';

export function getDefaultAiConfig(): UserAiConfig {
  const p = PROVIDER_PRESETS[0];
  return {
    providerId: p.id,
    providerName: p.name,
    shortName: p.shortName,
    endpoint: p.endpoint,
    model: 'jev-latest',
    apiKey: '',
    customHeaders: { ...p.customHeaders },
  };
}

export function loadAiConfig(): UserAiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultAiConfig();
    }
    const parsed = JSON.parse(raw);
    return {
      providerId: parsed.providerId || 'typesafe',
      providerName: parsed.providerName || 'TypeSafe Jev',
      shortName: parsed.shortName || 'TypeSafe',
      endpoint: parsed.endpoint || 'https://api.typesafe.ai/v1/systemone',
      model: parsed.model || 'jev-latest',
      apiKey: parsed.apiKey || '',
      customHeaders: parsed.customHeaders || {},
    };
  } catch {
    return getDefaultAiConfig();
  }
}

export function saveAiConfig(cfg: UserAiConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}
