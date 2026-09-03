import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import Taro from "@tarojs/taro";
import { API_BASE } from "@/config";
import { useUserStore } from "@/stores/user-store";
import { ApiEnvelope, AuthTokens } from "@/types/api";
import { currentPageUrl, openLogin } from "@/utils/login-return";
import { networkFailureMessage } from "@/utils/request-network";

const REQUEST_TIMEOUT = 10_000;

export interface RequestConfig extends AxiosRequestConfig {
  skipAuthRefresh?: boolean;
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

function resolveUrl(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (isAbsoluteUrl(url)) return url;

  return `${config.baseURL ?? ""}${url}`;
}

function normalizeHeaders(
  config: InternalAxiosRequestConfig,
): Record<string, string> {
  const headers = config.headers?.toJSON() ?? {};
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

/** 微信请求会把对象中的 undefined 转成字符串 "undefined"，导致后端 DTO 校验失败。 */
function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value && Object.prototype.toString.call(value) === "[object Object]") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)]),
    );
  }
  return value;
}

const taroAdapter: AxiosAdapter = async (config) => {
  try {
    const result = await Taro.request<unknown>({
      url: resolveUrl(config),
      data: removeUndefined(config.data ?? config.params),
      header: normalizeHeaders(config),
      method: (
        config.method ?? "get"
      ).toUpperCase() as keyof Taro.request.Method,
      timeout: config.timeout ?? REQUEST_TIMEOUT,
      responseType:
        config.responseType === "arraybuffer" ? "arraybuffer" : "text",
    });

    const response: AxiosResponse = {
      data: result.data,
      status: result.statusCode,
      statusText: String(result.statusCode),
      headers: result.header,
      config,
      request: result,
    };

    if (result.statusCode >= 200 && result.statusCode < 300) return response;

    throw new AxiosError(
      `请求失败：HTTP ${result.statusCode}`,
      undefined,
      config,
      result,
      response,
    );
  } catch (error) {
    if (axios.isAxiosError(error)) throw error;
    throw new AxiosError(
      networkFailureMessage(error, resolveUrl(config)),
      AxiosError.ERR_NETWORK,
      config,
    );
  }
};

export const http = axios.create({
  // API_BASE 在编译时由当前 mode 对应的 .env 文件决定。
  baseURL: API_BASE,
  timeout: REQUEST_TIMEOUT,
  adapter: taroAdapter,
});

http.interceptors.request.use((config) => {
  const { accessToken } = useUserStore.getState();
  if ((config as RequestConfig).skipAuth) config.headers.delete('Authorization');
  else if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<AuthTokens> | null = null;
let redirectingToLogin = false;

function invalidateSession(): void {
  useUserStore.getState().clearSession();
  if (redirectingToLogin) return;

  redirectingToLogin = true;
  // 会话已无法恢复，不能静默重新登录；跳转授权页让用户主动确认登录。
  void openLogin(currentPageUrl(), true).catch(() => {
    redirectingToLogin = false;
  });
}

async function refreshToken(): Promise<AuthTokens> {
  const { refreshToken: token } = useUserStore.getState();
  if (!token) throw new Error("Missing refresh token");
  const response = await http.post<ApiEnvelope<AuthTokens>>(
    "/auth/refresh-token",
    { refresh_token: token },
    { skipAuthRefresh: true } as AxiosRequestConfig,
  );
  if (response.data.code !== 0) throw new Error(response.data.message);
  return response.data.data;
}

http.interceptors.response.use(
  (response) => response,
  async (
    error: AxiosError & {
      config?: AxiosRequestConfig & {
        _retried?: boolean;
        skipAuthRefresh?: boolean;
      };
    },
  ) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config.skipAuthRefresh
    ) {
      config._retried = true;
      try {
        refreshPromise ??= refreshToken();
        const tokens = await refreshPromise;
        const state = useUserStore.getState();
        if (!state.user) throw new Error("Missing user session");
        state.setSession(tokens.access_token, tokens.refresh_token, state.user);
        redirectingToLogin = false;
        config.headers.set("Authorization", `Bearer ${tokens.access_token}`);
        return http.request(config);
      } catch {
        invalidateSession();
      } finally {
        refreshPromise = null;
      }
    }
    return Promise.reject(error);
  },
);

export async function request<T>(config: RequestConfig): Promise<T> {
  try {
    const response = await http.request<T>(config);
    const payload = response.data as ApiEnvelope<T>;
    if (typeof payload === "object" && payload !== null && "code" in payload) {
      if (payload.code !== 0) throw new ApiError(payload.message, payload.code, response.status, payload.requestId);
      return payload.data;
    }
    return response.data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data as Partial<ApiEnvelope<unknown>> | undefined;
      if (payload && typeof payload.code === "number") {
        throw new ApiError(payload.message ?? "请求失败", payload.code, error.response?.status, payload.requestId);
      }
    }
    throw error;
  }
}
