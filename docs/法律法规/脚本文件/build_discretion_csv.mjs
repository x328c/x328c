#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.dirname(scriptDir);
const inputPath = path.join(sourceDir, '自治区道路交通违法行为行政处罚裁量权基准.xlsx');
const templatePath = path.join(sourceDir, '..', 'V2.0文档', 'S3法规CSV模板.csv');
const outputPath = path.join(scriptDir, '自治区道路交通违法行为行政处罚裁量权基准导入文件.csv');
const reportPath = path.join(scriptDir, '自治区道路交通违法行为行政处罚裁量权基准导入校验报告.json');
const inputPreviewPath = '/private/tmp/modazi-discretion-workbook-top.png';
const outputPreviewPath = '/private/tmp/modazi-discretion-csv-top.png';

const SOURCE_URL = 'https://gat.xinjiang.gov.cn/gat/gawj/202503/3936ce139b084a9082a72c5bb554942d.shtml';
const DOCUMENT_NO = '新公规〔2025〕1号';
const ISSUER = '新疆维吾尔自治区公安厅';
const BASE_TAG = '交通违法裁量基准';
const EXPECTED_ROWS = 346;
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const VERIFIED_ON = '2026-08-08';

const EXPECTED_SOURCE_HEADERS = [
  '序号', '违法行为', '违法描述', '违法内容', '违法规定', '法律条文', '违法记分数',
  '罚款最小值', '罚款最大值', '罚款默认值（指导基准）', '暂扣', '吊销',
  '拘留最小', '拘留最大', '拘留默认值（指导基准）', '警告标记',
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const clean = (value) => value === null || value === undefined
  ? ''
  : String(value).replace(/\s+/gu, ' ').trim();
const compact = (value) => clean(value)
  .replace(/\s+/gu, '')
  .replace(/^[）)]/u, '')
  .replace(/[，。；、]+$/u, '')
  .trim();
const header = (value) => clean(value).replace(/\s+/gu, '');
const csvField = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
};
const csvText = (headers, rows) => `\uFEFF${[headers, ...rows.map((row) => headers.map((key) => row[key]))]
  .map((row) => row.map(csvField).join(','))
  .join('\r\n')}\r\n`;

const TOPIC_RULES = [
  [/未取得.*驾驶证|无证驾驶/u, '无证驾驶'],
  [/驾驶证被吊销|驾驶证吊销/u, '吊销期驾驶'],
  [/驾驶证被暂扣|驾驶证暂扣/u, '暂扣期驾驶'],
  [/醉酒.*驾驶|醉驾/u, '醉酒驾驶'],
  [/饮酒.*驾驶|酒驾/u, '饮酒驾驶'],
  [/定期进行安全技术检验|逾期未检/u, '逾期未安全检验'],
  [/连续驾驶.*4小时|疲劳驾驶/u, '疲劳驾驶'],
  [/载人超过核定人数|载客.*超员/u, '载客超员'],
  [/超速|超过规定时速/u, '超速行驶'],
  [/超载|超过核定载质量/u, '载货超载'],
  [/应急车道.*停车/u, '应急车道停车'],
  [/行车道.*停车|违法停车/u, '违法停车'],
  [/教练员|随车指导|学习驾驶/u, '违规学习驾驶'],
  [/消声器|排气管|擅自改装/u, '非法改装'],
  [/排放检验不合格/u, '排放检验不合格'],
  [/交通管制.*强行通行/u, '违反交通管制'],
  [/欺骗|贿赂.*驾驶证/u, '骗领驾驶证'],
  [/匝道.*妨碍/u, '匝道汇入妨碍通行'],
  [/铁道路口/u, '铁路道口违规'],
  [/借道超车|占用对面车道|穿插/u, '违规超车穿插'],
  [/载货.*长度.*宽度.*高度/u, '车辆超限载货'],
  [/非法安装.*警报器/u, '非法安装警报器'],
  [/非法安装.*标志灯具/u, '非法安装标志灯具'],
  [/伪造|变造/u, '伪造变造证牌'],
  [/未悬挂.*号牌/u, '未悬挂机动车号牌'],
  [/不避让.*行人|未停车让行/u, '未礼让行人'],
  [/人行横道.*未减速/u, '人行横道未减速'],
];

const CONTEXT_RULES = [
  [/非营运客车/u, '非营运客车'],
  [/(?<!非)营运客车/u, '营运客车'],
  [/危险物品运输/u, '危险品运输车'],
  [/公路客运/u, '公路客运车'],
  [/旅游客运/u, '旅游客运车'],
  [/校车/u, '校车'],
  [/7座以上载客/u, '7座以上客车'],
  [/中型以上载客/u, '中型以上客车'],
  [/重型货车/u, '重型货车'],
  [/中型货车/u, '中型货车'],
  [/小微型机动车/u, '小微型机动车'],
  [/载货汽车/u, '载货汽车'],
  [/摩托车/u, '摩托车'],
  [/拖拉机/u, '拖拉机'],
  [/高速公路/u, '高速公路'],
  [/城市快速路/u, '城市快速路'],
  [/非机动车/u, '非机动车'],
  [/行人/u, '行人'],
];

function topicTag(description, violationContent) {
  const source = `${compact(description)}${compact(violationContent)}`;
  const matched = TOPIC_RULES.find(([pattern]) => pattern.test(source));
  if (matched) return matched[1];
  const fallback = compact(description).replace(/的$/u, '');
  return fallback.length <= 24 ? fallback : fallback.slice(0, 24);
}

function conciseTags(source, description, violationContent) {
  const combined = `${compact(description)}${compact(violationContent)}`;
  const contextTags = CONTEXT_RULES
    .filter(([pattern]) => pattern.test(combined))
    .map(([, label]) => label)
    .slice(0, 2);
  const penaltyTags = [
    Number(source[7]) > 0 || Number(source[8]) > 0 || Number(source[9]) > 0 ? '罚款' : '',
    clean(source[10]) ? '暂扣驾驶证' : '',
    clean(source[11]) ? '吊销驾驶证' : '',
    Number(source[12]) > 0 || Number(source[13]) > 0 || Number(source[14]) > 0 ? '行政拘留' : '',
    /可警告/u.test(compact(source[15])) && !/不可警告/u.test(compact(source[15])) ? '可警告' : '',
  ].filter(Boolean);
  return [...new Set([BASE_TAG, topicTag(description, violationContent), ...contextTags, ...penaltyTags])];
}

const inputBytes = await fs.readFile(inputPath);
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItemAt(0);
const used = sheet.getUsedRange(true);
const values = used.values;

const headerIndex = values.findIndex((row) => header(row[0]) === '序号');
if (headerIndex < 0) throw new Error('未找到“序号”表头行');
const actualSourceHeaders = values[headerIndex].map(header);
if (JSON.stringify(actualSourceHeaders) !== JSON.stringify(EXPECTED_SOURCE_HEADERS)) {
  throw new Error(`Excel 表头不匹配：${JSON.stringify(actualSourceHeaders)}`);
}

const inputPreview = await workbook.render({ sheetName: sheet.name, range: 'A1:P15', scale: 2, format: 'png' });
await fs.writeFile(inputPreviewPath, new Uint8Array(await inputPreview.arrayBuffer()));

if (process.argv.includes('--inspect-only')) {
  const summary = await workbook.inspect({ kind: 'workbook,sheet,table', maxChars: 8000, tableMaxRows: 12, tableMaxCols: 16, tableMaxCellChars: 160 });
  console.log(summary.ndjson);
  console.log(JSON.stringify({ sheet: sheet.name, usedRange: used.address, rows: values.length, columns: values[0]?.length ?? 0, headerRow: headerIndex + 1, preview: inputPreviewPath }));
  process.exit(0);
}

const templateText = (await fs.readFile(templatePath, 'utf8')).replace(/^\uFEFF/u, '');
const templateWorkbook = await Workbook.fromCSV(templateText, { sheetName: 'Template' });
const templateHeaders = templateWorkbook.worksheets.getItemAt(0).getUsedRange(true).values[0].map(clean);

const dataRows = values
  .slice(headerIndex + 1)
  .filter((row) => Number.isInteger(Number(row[0])) && Number(row[0]) > 0);
if (dataRows.length !== EXPECTED_ROWS) throw new Error(`有效数据行应为 ${EXPECTED_ROWS}，实际 ${dataRows.length}`);

const rows = dataRows.map((source, offset) => {
  const sequence = Number(source[0]);
  if (sequence !== offset + 1) throw new Error(`序号不连续：期望 ${offset + 1}，实际 ${sequence}`);
  const violationCode = clean(source[1]);
  const description = clean(source[2]);
  const violationContent = clean(source[3]);
  const violationRule = clean(source[4]);
  const legalProvision = clean(source[5]);
  if (!violationCode || !description || !violationContent || !violationRule || !legalProvision) {
    throw new Error(`Excel 第 ${headerIndex + offset + 2} 行核心字段为空`);
  }
  const title = `${violationCode}${violationContent}`;
  const tags = conciseTags(source, description, violationContent).join('|');
  const content = [
    `违法内容：${violationContent}`,
    `违法规定：${violationRule}`,
    `法律条文：${legalProvision}`,
    `违法记分数：${clean(source[6])}`,
    `罚款最小值：${clean(source[7])}`,
    `罚款最大值：${clean(source[8])}`,
    `罚款默认值（指导基准）：${clean(source[9])}`,
    `暂扣：${clean(source[10])}`,
    `吊销：${clean(source[11])}`,
    `拘留最小：${clean(source[12])}`,
    `拘留最大：${clean(source[13])}`,
    `拘留默认值（指导基准）：${clean(source[14])}`,
    `警告标记：${clean(source[15])}`,
  ].join('\n');
  return {
    title,
    document_no: DOCUMENT_NO,
    document_no_empty_reason: '',
    issuer: ISSUER,
    authority_level: 'local',
    category: 'traffic',
    scope: 'REGIONAL',
    regions: '650000:新疆维吾尔自治区',
    tags,
    source_url: SOURCE_URL,
    published_at: '2025-03-11',
    effective_at: '2025-04-15',
    expired_at: '',
    effective_note: '自2025年4月15日起施行，有效期五年；发生交通事故、吊销或拘留以及警告适用条件以文件统一说明和具体执法事实为准。',
    last_verified_at: VERIFIED_ON,
    review_cycle_days: '30',
    replacement_regulation_id: '',
    summary: `新疆道路交通违法行为代码${violationCode}的行政处罚裁量基准，违法描述为“${description}”，适用于“${violationContent}”。本条仅提供官方信息索引，不生成个案处罚结论。`,
    content,
    change_note: `由《自治区道路交通违法行为行政处罚裁量权基准》${violationCode}号违法行为行结构化导入，待另一管理员复核后发布。`,
  };
});

const titles = new Set();
const allTags = new Set();
let maxTagsPerRow = 0;
let maxTagLength = 0;
for (const [index, row] of rows.entries()) {
  if (Object.keys(row).join('|') !== templateHeaders.join('|')) throw new Error(`第 ${index + 2} 行字段顺序与模板不一致`);
  if (row.title !== `${clean(dataRows[index][1])}${clean(dataRows[index][3])}`) throw new Error(`第 ${index + 2} 行 title 映射错误`);
  if (row.tags !== conciseTags(dataRows[index], clean(dataRows[index][2]), clean(dataRows[index][3])).join('|')) throw new Error(`第 ${index + 2} 行 tags 映射错误`);
  if (row.change_note !== `由《自治区道路交通违法行为行政处罚裁量权基准》${clean(dataRows[index][1])}号违法行为行结构化导入，待另一管理员复核后发布。`) throw new Error(`第 ${index + 2} 行 change_note 映射错误`);
  if (!row.content.startsWith(`违法内容：${clean(dataRows[index][3])}\n违法规定：`)) throw new Error(`第 ${index + 2} 行 content 映射错误`);
  if (titles.has(row.title)) throw new Error(`title 重复：${row.title}`);
  titles.add(row.title);
  if (row.title.length > 200 || row.summary.length > 1000 || row.content.length > 100_000) throw new Error(`第 ${index + 2} 行超过后端字段长度限制`);
  const rowTags = row.tags.split('|');
  if (rowTags.length > 12) throw new Error(`第 ${index + 2} 行标签超过 12 个`);
  if (rowTags.some((tag) => tag.length > 50)) throw new Error(`第 ${index + 2} 行存在超过 50 字的标签`);
  rowTags.forEach((tag) => allTags.add(tag));
  maxTagsPerRow = Math.max(maxTagsPerRow, rowTags.length);
  maxTagLength = Math.max(maxTagLength, ...rowTags.map((tag) => tag.length));
}

const outputText = csvText(templateHeaders, rows);
const outputBytes = Buffer.from(outputText, 'utf8');
if (outputBytes.length > MAX_CSV_BYTES) throw new Error(`CSV ${outputBytes.length} bytes，超过 2MB`);

if (process.argv.includes('--check-only')) {
  const existing = await fs.readFile(outputPath);
  if (!existing.equals(outputBytes)) throw new Error('现有 CSV 与 Excel/脚本重新生成结果不一致');
} else {
  await fs.writeFile(outputPath, outputBytes);
}

const outputWorkbook = await Workbook.fromCSV(outputText.replace(/^\uFEFF/u, ''), { sheetName: '法规导入数据' });
const outputUsed = outputWorkbook.worksheets.getItemAt(0).getUsedRange(true);
if (outputUsed.values.length !== EXPECTED_ROWS + 1 || outputUsed.values[0].length !== templateHeaders.length) {
  throw new Error('导出 CSV 重新读取后的行列数不正确');
}
const inspection = await outputWorkbook.inspect({ kind: 'sheet,table', maxChars: 6000, tableMaxRows: 5, tableMaxCols: 20, tableMaxCellChars: 120 });
console.log(inspection.ndjson);
const outputPreview = await outputWorkbook.render({ sheetName: '法规导入数据', range: 'A1:T6', scale: 1, format: 'png' });
await fs.writeFile(outputPreviewPath, new Uint8Array(await outputPreview.arrayBuffer()));

const report = {
  generated_on: VERIFIED_ON,
  input_file: path.basename(inputPath),
  input_sha256: sha256(inputBytes),
  source_sheet: sheet.name,
  source_range: used.address,
  source_header_row: headerIndex + 1,
  source_data_rows: dataRows.length,
  output_file: path.basename(outputPath),
  output_sha256: sha256(outputBytes),
  output_bytes: outputBytes.length,
  output_rows: rows.length,
  output_columns: templateHeaders.length,
  first_sequence: Number(dataRows[0][0]),
  last_sequence: Number(dataRows.at(-1)[0]),
  unique_titles: titles.size,
  unique_tags: allTags.size,
  max_tags_per_row: maxTagsPerRow,
  max_tag_length: maxTagLength,
  document_no: DOCUMENT_NO,
  source_url: SOURCE_URL,
  mapping_assertions: ['title', 'document_no', 'issuer', 'concise_tags', 'content', 'change_note', 'template_headers', 'field_limits'],
  input_preview: inputPreviewPath,
  output_preview: outputPreviewPath,
};
if (!process.argv.includes('--check-only')) await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
