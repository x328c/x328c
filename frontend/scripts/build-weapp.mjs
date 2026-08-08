import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tabVariant = process.argv[2] ?? "4";
const mode = process.argv[3] ?? "production";

if (!new Set(["4", "5"]).has(tabVariant)) {
  throw new Error(`不支持的 Tab 变体：${tabVariant}，只能使用 4 或 5`);
}

if (!new Set(["development", "test", "production"]).has(mode)) {
  throw new Error(`不支持的构建模式：${mode}`);
}

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
  env: { ...process.env, TARO_APP_TAB_VARIANT: tabVariant },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const appJsonPath = join(projectRoot, "dist", "app.json");
const appConfig = JSON.parse(readFileSync(appJsonPath, "utf8"));
const tabItems = appConfig.tabBar?.list ?? [];
const expectedCount = Number(tabVariant);
const expectedTexts = tabVariant === "5"
  ? ["约骑", "路线", "论坛", "消息", "我的"]
  : ["约骑", "路线", "消息", "我的"];

if (tabItems.length !== expectedCount) {
  throw new Error(`Tab 构建校验失败：期望 ${expectedCount} 项，实际 ${tabItems.length} 项`);
}

if (tabItems.map((item) => item.text).join(",") !== expectedTexts.join(",")) {
  throw new Error(`Tab 顺序校验失败：${tabItems.map((item) => item.text).join(",")}`);
}

const hasForumPage = appConfig.pages.includes("pages/forum/index");
if (hasForumPage !== (tabVariant === "5")) {
  throw new Error("论坛页面与 Tab 变体不一致");
}

for (const item of tabItems) {
  for (const iconField of ["iconPath", "selectedIconPath"]) {
    if (!existsSync(join(projectRoot, "dist", item[iconField]))) {
      throw new Error(`Tab 图标缺失：${item[iconField]}`);
    }
  }
}

console.log(`Tab 构建校验通过：${tabVariant} Tab / ${mode}`);
