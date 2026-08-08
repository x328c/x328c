#!/usr/bin/env python3
"""将指定的两份官方法规 PDF 转换为 S3 法规导入 CSV。

脚本只生成可预览、可复核的草稿导入文件，不负责发布法规。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pdfplumber


HEADERS = [
    "title",
    "document_no",
    "document_no_empty_reason",
    "issuer",
    "authority_level",
    "category",
    "scope",
    "regions",
    "tags",
    "source_url",
    "published_at",
    "effective_at",
    "expired_at",
    "effective_note",
    "last_verified_at",
    "review_cycle_days",
    "replacement_regulation_id",
    "summary",
    "content",
    "change_note",
]

SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = SCRIPT_DIR.parent
DEFAULT_OUTPUT = SCRIPT_DIR / "法规导入数据.csv"
DEFAULT_REPORT = SCRIPT_DIR / "法规导入校验报告.json"
TEMPLATE = SOURCE_DIR.parent / "V2.0文档" / "S3法规CSV模板.csv"
VERIFIED_ON = date(2026, 8, 3).isoformat()
WATERMARK_LINES = {"新", "疆", "维", "吾", "尔", "自", "治", "区", "公", "安", "厅"}


@dataclass(frozen=True)
class SourceSpec:
    filename: str
    title: str
    document_no: str
    issuer: str
    authority_level: str
    category: str
    scope: str
    regions: str
    tags: str
    source_url: str
    published_at: str
    effective_at: str
    expired_at: str
    effective_note: str
    review_cycle_days: int
    summary: str
    change_note: str
    content_start: str
    content_end_before: str | None = None


SOURCES = [
    SourceSpec(
        filename="中华人民共和国道路交通安全法（主席令第8号）.pdf",
        title="中华人民共和国道路交通安全法（主席令第8号公布文本）",
        document_no="中华人民共和国主席令第八号",
        issuer="全国人民代表大会常务委员会",
        authority_level="law",
        category="traffic",
        scope="NATIONAL",
        regions="",
        tags="道路交通安全|机动车|驾驶人|道路通行|交通事故|摩托车",
        source_url="https://gat.xinjiang.gov.cn/gat/flfg/201712/5ab1a15b470646018052b74ede4b46fe.shtml",
        published_at="2003-10-28",
        effective_at="2004-05-01",
        expired_at="",
        effective_note="源文件为2003年主席令第8号公布文本；国家法律法规数据库显示后续存在修正，发布前须核对现行文本与历史沿革。",
        review_cycle_days=30,
        summary="规定道路交通安全管理、车辆和驾驶人、道路通行、交通事故处理、执法监督及法律责任。该条目索引用户提供的2003年公布文本，不构成现行版本或个案法律结论。",
        change_note="由用户提供PDF结构化导入；保留2003年公布版本，待另一管理员对照国家法律法规数据库复核后再决定发布或创建后续修订。",
        content_start="中华人民共和国主席令第八号",
        content_end_before="转载自公安部官网",
    ),
    SourceSpec(
        filename="关于印发《自治区道路交通违法行为行政处罚裁量权基准适用规则》《自治区道路交通违法行为行政处罚裁量权基准》的通知-20260508202156407.pdf",
        title="关于印发《自治区道路交通违法行为行政处罚裁量权基准适用规则》《自治区道路交通违法行为行政处罚裁量权基准》的通知",
        document_no="新公规〔2025〕1号",
        issuer="新疆维吾尔自治区公安厅",
        authority_level="local",
        category="traffic",
        scope="REGIONAL",
        regions="650000:新疆维吾尔自治区",
        tags="道路交通违法|行政处罚|裁量权基准|公安交管|摩托车|新疆",
        source_url="https://gat.xinjiang.gov.cn/gat/gawj/202503/3936ce139b084a9082a72c5bb554942d.shtml",
        published_at="2025-03-11",
        effective_at="2025-04-15",
        expired_at="",
        effective_note="自2025年4月15日起施行，有效期五年；具体失效日发布前由复核管理员依据官方口径确认。",
        review_cycle_days=30,
        summary="规范新疆道路交通违法行为行政处罚裁量权的适用原则、车辆类型分档、处罚基准和执行要求，附件包含具体违法行为裁量基准。仅提供官方信息索引，不生成处罚结论。",
        change_note="由用户提供PDF结构化导入；正文、文号、施行时间和适用地区已按新疆维吾尔自治区公安厅官方页面核对，仍须另一管理员复核后发布。",
        content_start="新 疆 维 吾 尔 自 治 区 公 安 厅 文 件",
    ),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_text(path: Path) -> tuple[str, int]:
    pages: list[str] = []
    with pdfplumber.open(path) as document:
        for page in document.pages:
            pages.append(page.extract_text(x_tolerance=2, y_tolerance=3) or "")
    return "\n\n".join(pages), len(pages)


def normalize_text(raw: str, spec: SourceSpec) -> str:
    raw = raw.replace("\x00", "").replace("\u00a0", " ").replace("\r", "\n")
    start = raw.find(spec.content_start)
    if start < 0:
        raise ValueError(f"{spec.filename}: 未找到正文起点 {spec.content_start!r}")
    raw = raw[start:]
    if spec.content_end_before:
        end = raw.find(spec.content_end_before)
        if end >= 0:
            raw = raw[:end]

    cleaned: list[str] = []
    for original_line in raw.splitlines():
        line = re.sub(r"[ \t]+", " ", original_line).strip()
        if line in WATERMARK_LINES:
            continue
        if re.fullmatch(r"[＿_—-]\s*\d+\s*[＿_—-]", line):
            continue
        line = re.sub(r"日{2,}$", "日", line)
        if line or (cleaned and cleaned[-1]):
            cleaned.append(line)
    text = "\n".join(cleaned).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def build_row(spec: SourceSpec, content: str) -> dict[str, str]:
    return {
        "title": spec.title,
        "document_no": spec.document_no,
        "document_no_empty_reason": "",
        "issuer": spec.issuer,
        "authority_level": spec.authority_level,
        "category": spec.category,
        "scope": spec.scope,
        "regions": spec.regions,
        "tags": spec.tags,
        "source_url": spec.source_url,
        "published_at": spec.published_at,
        "effective_at": spec.effective_at,
        "expired_at": spec.expired_at,
        "effective_note": spec.effective_note,
        "last_verified_at": VERIFIED_ON,
        "review_cycle_days": str(spec.review_cycle_days),
        "replacement_regulation_id": "",
        "summary": spec.summary,
        "content": content,
        "change_note": spec.change_note,
    }


def validate_template() -> None:
    with TEMPLATE.open("r", encoding="utf-8-sig", newline="") as stream:
        template_headers = next(csv.reader(stream))
    if template_headers != HEADERS:
        raise ValueError("S3法规CSV模板.csv 表头与脚本定义不一致，请先人工审查模板变更")


def validate_row(row: dict[str, str]) -> None:
    if set(row) != set(HEADERS):
        raise ValueError("CSV 字段集合不匹配")
    if not 2 <= len(row["title"]) <= 200:
        raise ValueError(f"标题长度无效：{row['title']}")
    if row["scope"] == "NATIONAL" and row["regions"]:
        raise ValueError("全国范围不得填写地区")
    if row["scope"] == "REGIONAL" and not re.fullmatch(r"\d{6}:[^|]+(?:\|\d{6}:[^|]+)*", row["regions"]):
        raise ValueError("地方范围地区格式无效")
    if len(row["tags"].split("|")) > 12:
        raise ValueError("标签超过 12 个")
    if not row["source_url"].startswith(("http://", "https://")):
        raise ValueError("来源 URL 无效")
    if not row["summary"] or len(row["summary"]) > 1000:
        raise ValueError("摘要长度无效")
    if not row["content"] or len(row["content"]) > 100_000:
        raise ValueError(f"正文长度无效：{len(row['content'])}")
    if not 2 <= len(row["change_note"]) <= 500:
        raise ValueError("修订说明长度无效")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--check-only", action="store_true", help="只校验源文件与现有输出，不重写文件")
    args = parser.parse_args()

    validate_template()
    rows: list[dict[str, str]] = []
    report_rows: list[dict[str, object]] = []
    for spec in SOURCES:
        source = SOURCE_DIR / spec.filename
        if not source.is_file():
            raise FileNotFoundError(source)
        raw, pages = extract_text(source)
        content = normalize_text(raw, spec)
        row = build_row(spec, content)
        validate_row(row)
        rows.append(row)
        report_rows.append(
            {
                "source_file": spec.filename,
                "source_sha256": sha256(source),
                "pages": pages,
                "content_characters": len(content),
                "title": spec.title,
                "document_no": spec.document_no,
                "scope": spec.scope,
                "source_url": spec.source_url,
                "warnings": [spec.effective_note],
            }
        )

    if args.check_only:
        if not args.output.is_file():
            raise FileNotFoundError(args.output)
        with args.output.open("r", encoding="utf-8-sig", newline="") as stream:
            existing = list(csv.DictReader(stream))
        if existing != rows:
            raise ValueError("现有 CSV 与源 PDF/脚本生成结果不一致")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=HEADERS, quoting=csv.QUOTE_MINIMAL)
            writer.writeheader()
            writer.writerows(rows)
        report = {
            "generated_on": VERIFIED_ON,
            "template": str(TEMPLATE.relative_to(SOURCE_DIR.parent.parent)),
            "row_count": len(rows),
            "csv_bytes": args.output.stat().st_size,
            "rows": report_rows,
        }
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"rows": len(rows), "output": str(args.output), "check_only": args.check_only}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
