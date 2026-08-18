import Taro from "@tarojs/taro";
import { STORAGE_KEYS } from "@/constants";

const ALLOWED_RETURN_PATHS = [
  "/pages/routes/index",
  "/packageRoutes/pages/detail/index",
  "/packageRegulations/pages/index/index",
  "/packageRegulations/pages/detail/index",
  "/packageRegulations/pages/safe-riding-initiative/index",
];

function isAllowed(url: string): boolean {
  return ALLOWED_RETURN_PATHS.some((path) => url === path || url.startsWith(`${path}?`));
}

export function saveLoginReturnUrl(url: string): void {
  if (isAllowed(url)) Taro.setStorageSync(STORAGE_KEYS.loginReturnUrl, url);
}

export function currentPageUrl(): string | undefined {
  const pages = Taro.getCurrentPages();
  const page = pages[pages.length - 1];
  if (!page?.route) return undefined;
  const query = Object.entries(page.options ?? {})
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `/${page.route}${query ? `?${query}` : ""}`;
}

export async function openLogin(returnUrl?: string, replace = false): Promise<void> {
  if (returnUrl) saveLoginReturnUrl(returnUrl);
  if (replace) await Taro.reLaunch({ url: "/pages/auth/index" });
  else await Taro.navigateTo({ url: "/pages/auth/index" });
}

export async function redirectAfterLogin(): Promise<void> {
  const url = Taro.getStorageSync<string>(STORAGE_KEYS.loginReturnUrl);
  Taro.removeStorageSync(STORAGE_KEYS.loginReturnUrl);
  if (url && isAllowed(url)) {
    if (url === "/pages/routes/index") await Taro.switchTab({ url });
    else await Taro.redirectTo({ url });
    return;
  }
  await Taro.switchTab({ url: "/pages/index/index" });
}
