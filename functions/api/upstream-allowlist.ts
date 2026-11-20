// 代理只允许转发到预设通道的上游地址。自定义通道的请求必须自带 API 密钥；
// 服务端环境变量密钥（CF_CLEF_API_KEY）只允许发往 api.cloudflare.com。
export const ALLOWED_UPSTREAM_HOSTS: readonly string[] = [
  'api.typesafe.ai',
  'api.subq.ai',
  'api.codiv.ai',
  'api.cloudflare.com',
  'meragpt.com',
  'console.nace.ai',
];

// 逐跳头由运行环境管理；Authorization 只允许来自客户端密钥或环境变量，
// Host/Content-Length 由 fetch 自行计算。这些头不允许被 x-jev-custom-headers 覆盖。
export const FORBIDDEN_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'content-length',
  'content-type',
  'authorization',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'te',
  'trailer',
  'cookie',
  'set-cookie',
]);

export function isAllowedUpstream(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  return ALLOWED_UPSTREAM_HOSTS.includes(url.hostname);
}
