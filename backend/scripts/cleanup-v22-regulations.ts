import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface CandidateRow {
  id: bigint;
  title: string;
  document_no: string | null;
  status: number;
  revision_id: bigint | null;
}

const prisma = new PrismaClient();
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || 'true'];
  }),
);
const execute = args.get('execute') === 'true';
const reportDir = resolve(args.get('report-dir') ?? 'reports/v2.2-regulation-cleanup');

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

async function candidates(): Promise<CandidateRow[]> {
  return prisma.$queryRaw<CandidateRow[]>`
    SELECT r.id, r.title, r.document_no, r.status, selected_revision.id AS revision_id
    FROM regulations r
    LEFT JOIN regulation_revisions selected_revision
      ON selected_revision.id = COALESCE(
        r.current_revision_id,
        (SELECT latest.id FROM regulation_revisions latest
         WHERE latest.regulation_id = r.id ORDER BY latest.version DESC, latest.id DESC LIMIT 1)
      )
    WHERE r.deleted_at IS NULL
      AND COALESCE(r.title, '') NOT LIKE '%摩托车%'
      AND COALESCE(selected_revision.summary, '') NOT LIKE '%摩托车%'
      AND COALESCE(selected_revision.content, '') NOT LIKE '%摩托车%'
      AND NOT EXISTS (
        SELECT 1 FROM regulation_tag_links rtl
        JOIN regulation_tags rt ON rt.id = rtl.tag_id
        WHERE rtl.regulation_id = r.id AND COALESCE(rt.name, '') LIKE '%摩托车%'
      )
    ORDER BY r.id
  `;
}

async function main() {
  const rows = await candidates();
  const generatedAt = new Date().toISOString();
  const summary = Object.entries(
    rows.reduce<Record<string, number>>((result, row) => {
      result[String(row.status)] = (result[String(row.status)] ?? 0) + 1;
      return result;
    }, {}),
  ).map(([status, count]) => ({ status: Number(status), count }));
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    resolve(reportDir, 'candidates.csv'),
    ['id,title,document_no,status,revision_id', ...rows.map((row) => [row.id, row.title, row.document_no, row.status, row.revision_id].map(csvCell).join(','))].join('\n'),
    'utf8',
  );
  await writeFile(
    resolve(reportDir, 'summary.json'),
    JSON.stringify({ generated_at: generatedAt, candidate_count: rows.length, by_status: summary }, null, 2),
    'utf8',
  );
  console.log(`V2.2 法规清理候选：${rows.length} 条；报告目录：${reportDir}`);
  if (!execute) {
    console.log(`当前为只读预演。复核报告和数据库备份后，使用 --execute --confirmation=DELETE-${rows.length} 执行。`);
    return;
  }
  if (args.get('confirmation') !== `DELETE-${rows.length}`) {
    throw new Error(`确认串不匹配，应为 DELETE-${rows.length}`);
  }
  const ids = rows.map((row) => row.id);
  await prisma.$transaction(async (tx) => {
    await tx.regulationImportRow.updateMany({ where: { regulation_id: { in: ids } }, data: { regulation_id: null } });
    await tx.regulationFeedback.deleteMany({ where: { regulation_id: { in: ids } } });
    await tx.regulation.updateMany({ where: { replacement_regulation_id: { in: ids } }, data: { replacement_regulation_id: null } });
    await tx.regulation.updateMany({ where: { id: { in: ids } }, data: { current_revision_id: null, replacement_regulation_id: null } });
    const deleted = await tx.regulation.deleteMany({ where: { id: { in: ids } } });
    if (deleted.count !== rows.length) throw new Error(`候选数量漂移：预期 ${rows.length}，实际 ${deleted.count}`);
    await tx.regulationTag.deleteMany({ where: { links: { none: {} } } });
  });
  const invalid = await candidates();
  if (invalid.length) throw new Error(`清理后仍有 ${invalid.length} 条不符合摩托车关键词规则的法规`);
  console.log(`已永久删除 ${rows.length} 条法规；只能通过执行前备份恢复。`);
}

main().finally(() => prisma.$disconnect());
