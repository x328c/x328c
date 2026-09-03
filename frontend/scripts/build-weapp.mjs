import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildTarget } from './weapp-build-target.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tabVariant = process.argv[2] ?? "4";
const mode = process.argv[3] ?? "production";

if (tabVariant !== "4") {
  throw new Error(`V2.2 仅支持 4 Tab 构建，当前为：${tabVariant}`);
}

const deviceEnvPath = join(projectRoot, '.env.device');
const targetEnv = resolveBuildTarget(mode, process.env.TARO_APP_API_BASE,
  mode === 'device' && existsSync(deviceEnvPath) ? readFileSync(deviceEnvPath, 'utf8') : '');

const taroBin = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "taro.cmd" : "taro",
);

// Taro 4.2's native doctor config checker can panic on macOS when the
// system-configuration service is unavailable. The generated app config is
// validated below (tabs, routes and icon files), while CI can still run the
// standalone doctor command on a supported runner.
const result = spawnSync(taroBin, ["build", "--type", "weapp", "--mode", mode, "--no-check"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    TARO_APP_TAB_VARIANT: tabVariant,
    ...targetEnv,
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const appJsonPath = join(projectRoot, "dist", "app.json");
const appConfig = JSON.parse(readFileSync(appJsonPath, "utf8"));
const tabItems = appConfig.tabBar?.list ?? [];
const expectedCount = Number(tabVariant);
const expectedTexts = ["同行助手", "路线", "助手通知", "我的"];

if (tabItems.length !== expectedCount) {
  throw new Error(`Tab 构建校验失败：期望 ${expectedCount} 项，实际 ${tabItems.length} 项`);
}

if (tabItems.map((item) => item.text).join(",") !== expectedTexts.join(",")) {
  throw new Error(`Tab 顺序校验失败：${tabItems.map((item) => item.text).join(",")}`);
}

const serializedConfig = JSON.stringify(appConfig);
for (const retiredPath of ["pages/forum", "packageForum", "pages/activities", "pages/my/activities"]) {
  if (serializedConfig.includes(retiredPath)) throw new Error(`V2.2 产物仍包含下线路径：${retiredPath}`);
}
if (appConfig.lazyCodeLoading !== "requiredComponents") {
  throw new Error(`组件按需注入配置缺失：${appConfig.lazyCodeLoading ?? "未设置"}`);
}
const projectConfig = JSON.parse(readFileSync(join(projectRoot, "project.config.json"), "utf8"));
if (projectConfig.setting?.minified !== true || projectConfig.setting?.minifyWXML !== true || projectConfig.setting?.minifyWXSS !== true) {
  throw new Error("微信项目 JS/WXML/WXSS 压缩配置未全部开启");
}

for (const item of tabItems) {
  for (const iconField of ["iconPath", "selectedIconPath"]) {
    if (!existsSync(join(projectRoot, "dist", item[iconField]))) {
      throw new Error(`Tab 图标缺失：${item[iconField]}`);
    }
  }
}

console.log(`V2.2 构建校验通过：4 Tab / 按需注入 / 压缩 / 无活动论坛路由 / ${mode}`);
if (targetEnv.TARO_APP_API_BASE) {
  const common = readFileSync(join(projectRoot, 'dist', 'common.js'), 'utf8');
  if (!common.includes(targetEnv.TARO_APP_API_BASE))
    throw new Error('编译产物API与构建目标不一致，请停止其他构建监听后重试');
  console.log(`已验证编译API：${targetEnv.TARO_APP_API_BASE}`);
}
