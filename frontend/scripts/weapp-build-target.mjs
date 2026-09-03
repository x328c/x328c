export function resolveBuildTarget(mode, override, deviceEnv = '') {
  if (!['development', 'test', 'device', 'production'].includes(mode))
    throw new Error(`不支持的构建模式：${mode}`);
  if (mode !== 'device' && mode !== 'production') return {};
  const configured = deviceEnv.match(/^\s*TARO_APP_API_BASE\s*=\s*(.*?)\s*$/m)?.[1]
    ?.replace(/^(['"])(.*)\1$/, '$2');
  const apiBase = override ?? (mode === 'production' ? 'https://jiangxingjc.cn/api/v1' : configured);
  if (!apiBase) throw new Error('缺少局域网API配置，请检查 .env.device');
  const url = new URL(apiBase);
  const host = url.hostname.toLowerCase();
  if (mode === 'device') {
    const parts = host.split('.').map(Number);
    const privateIp = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
    if (!privateIp || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('本地真机调试必须填写电脑局域网IP，不能使用127.0.0.1、云端或带凭证地址');
    return { TARO_APP_API_BASE: apiBase.replace(/\/+$/, ''), TARO_APP_ENV: 'development' };
  }
  if (url.protocol !== 'https:' || !host.includes('.') || host.endsWith('.localhost') ||
      host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':') ||
      url.username || url.password || url.search || url.hash)
    throw new Error('真机/生产API必须为无凭证、无查询参数的HTTPS公网域名，不能使用本机或IP地址');
  return { TARO_APP_API_BASE: apiBase.replace(/\/+$/, ''), TARO_APP_ENV: 'production' };
}
