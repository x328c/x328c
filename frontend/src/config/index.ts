/**
 * 应用运行环境。该值由 Taro 在构建时从对应的 .env.[mode] 文件静态注入。
 */
export type AppEnv = "development" | "test" | "production";

const NODE_ENV = process.env.NODE_ENV;
const DEFAULT_API_BASE =
  NODE_ENV === "production"
    ? "https://jiangxingjc.cn/api/v1"
    : "http://localhost:3000/api/v1";
const DEFAULT_ENV: AppEnv =
  NODE_ENV === "production" ? "production" : "development";

function isAppEnv(value: string | undefined): value is AppEnv {
  return value === "development" || value === "test" || value === "production";
}

/**
 * 后端 API 根地址。移除末尾的斜杠，确保拼接接口路径时不会出现双斜杠。
 */
export const API_BASE: string = (
  process.env.TARO_APP_API_BASE || DEFAULT_API_BASE
).replace(/\/+$/, "");

/** 当前后端环境，而非 Taro 的编译平台（weapp、h5 等）。 */
export const ENV: AppEnv = isAppEnv(process.env.TARO_APP_ENV)
  ? process.env.TARO_APP_ENV
  : DEFAULT_ENV;

export const IS_DEV: boolean = ENV === "development";
export const IS_TEST: boolean = ENV === "test";
export const IS_PROD: boolean = ENV === "production";

/** 生产环境关闭应用级调试开关。 */
export const DEBUG: boolean = !IS_PROD;
