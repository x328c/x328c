/** Classify without logging native messages, which may contain URLs or tokens. */
export function isLoopbackApi(url: string): boolean {
  return /^https?:\/\/(?:localhost(?:\.|(?=[:/]|$))|127(?:\.\d{1,3}){3}|\[::1\])(?=[:/]|$)/i.test(url);
}

export function networkFailureMessage(error: unknown, url: string): string {
  if (isLoopbackApi(url))
    return '当前使用回环地址；真机请使用电脑局域网地址';
  const message = String((error as { errMsg?: string; message?: string } | null)?.errMsg ??
    (error as { message?: string } | null)?.message ?? '').toLowerCase();
  if (/url not in domain list|domain list|合法域名/.test(message))
    return '请求域名未获微信许可，请检查小程序合法域名配置';
  if (/ssl|certificate|tls|证书/.test(message))
    return '安全连接失败，请检查服务器HTTPS证书';
  if (/timeout|timed out/.test(message)) return '请求超时，请稍后重试';
  return '网络连接失败，请检查网络后重试';
}
