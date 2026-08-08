import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(new URL("..", import.meta.url).pathname, "dist");
if (!fs.existsSync(dist)) throw new Error("请先运行小程序构建");
function size(file) {
  const stat = fs.statSync(file);
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(file).reduce((total, child) => total + size(path.join(file, child)), 0);
}
const children = fs.readdirSync(dist);
const mainBytes = children.filter((name) => !name.startsWith("package")).reduce((total, name) => total + size(path.join(dist, name)), 0);
const packages = Object.fromEntries(children.filter((name) => name.startsWith("package")).map((name) => [name, size(path.join(dist, name))]));
const budget = { mainBytes: 1_200_000, subpackageBytes: 250_000 };
console.log(JSON.stringify({ mainBytes, packages, budget }, null, 2));
if (mainBytes > budget.mainBytes) throw new Error(`主包超出预算：${mainBytes} > ${budget.mainBytes}`);
for (const [name, bytes] of Object.entries(packages)) if (bytes > budget.subpackageBytes) throw new Error(`${name} 超出预算：${bytes} > ${budget.subpackageBytes}`);
