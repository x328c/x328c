# 法规 PDF 结构化脚本

本目录把上级目录中的两份法规 PDF 转换为 `docs/V2.0文档/S3法规CSV模板.csv` 格式。

## 生成与校验

脚本依赖 Python 3 和 `pdfplumber`：

```bash
python3 build_regulations_csv.py
python3 build_regulations_csv.py --check-only
```

输出：

- `法规导入数据.csv`：UTF-8 BOM 编码，包含 20 个模板字段和两条法规数据。
- `法规导入校验报告.json`：只保存文件摘要、页数、正文长度、来源和版本警示，不重复保存法规全文。

## 数据边界

- 导入工作流只能生成草稿，不允许 CSV 直接发布。
- 《中华人民共和国道路交通安全法》源 PDF 是主席令第8号的早期公布文本，不代表当前修正版本；必须由另一管理员对照国家法律法规数据库复核。
- `新公规〔2025〕1号` 的明确适用范围是新疆维吾尔自治区；有效期五年的具体终止日留给复核管理员依据官方口径确认。
- `source_url` 指向对应官方页面；系统提供信息索引，不生成法律结论。

## 裁量权基准逐行导入

`build_discretion_csv.mjs` 使用工作区提供的 `@oai/artifact-tool` 读取上级目录中的 `自治区道路交通违法行为行政处罚裁量权基准.xlsx`，把序号 1-346 转换为每行一个法规草稿：

```bash
node build_discretion_csv.mjs
node build_discretion_csv.mjs --check-only
```

运行前需要让 Node 能解析 Codex 工作区依赖中提供的 `@oai/artifact-tool`；本脚本不向项目 `package.json` 添加仅用于内容整理的运行时依赖。

输出为 `自治区道路交通违法行为行政处罚裁量权基准导入文件.csv`，表头与 S3 模板严格一致。`tags` 按违法类型、车辆/道路场景和处罚形式生成精简检索词；`change_note` 使用完整违法代码生成“由《自治区道路交通违法行为行政处罚裁量权基准》{违法行为}号违法行为行结构化导入，待另一管理员复核后发布。”。脚本会校验源表头、连续序号、唯一标题、标签数量与长度、字段拼接、行数和 2MB 文件限制；不会提交复核或发布。

本地数据库替换使用 `backend/scripts/replace-discretion-regulations.ts`。脚本必须指定旧任务 ID 和精确删除数量，先校验导入行、关联法规、文号、发布机构、反馈和外部替代引用，再事务删除旧任务与旧法规、保留并追加审计日志，最后复用法规 CSV 预览/确认服务重新导入草稿。
