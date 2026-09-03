import { AppException } from '../common/exceptions/app.exception';

const PRIVATE_IPV4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

function providerFor(hostname: string): string {
  if (hostname.endsWith('qq.com')) return 'tencent';
  if (hostname.endsWith('amap.com')) return 'amap';
  if (hostname.endsWith('baidu.com')) return 'baidu';
  return 'other';
}

export function normalizeExternalRouteUrl(value?: string | null): {
  external_route_url: string | null;
  external_route_provider: string | null;
  external_url_status: number;
} {
  const input = value?.normalize('NFKC').trim();
  if (!input) {
    return {
      external_route_url: null,
      external_route_provider: null,
      external_url_status: 0,
    };
  }
  if (input.length > 1000) throw new AppException(53102, '第三方路线链接过长');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppException(53102, '第三方路线链接格式无效');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    PRIVATE_IPV4.test(hostname)
  ) {
    throw new AppException(53102, '仅支持包含 map 的安全 HTTPS 路线链接');
  }
  url.hash = '';
  if (!/map/i.test(url.toString()))
    throw new AppException(53102, '仅支持包含 map 的安全 HTTPS 路线链接');
  return {
    external_route_url: url.toString(),
    external_route_provider: providerFor(hostname),
    external_url_status: 1,
  };
}
