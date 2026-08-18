import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseSafeRidingInitiativeText } from '../src/safety/initiative-content';

const prisma = new PrismaClient();
const sourcePath = resolve(process.cwd(), 'content/safe-riding-initiative.md');

async function main() {
  const content = parseSafeRidingInitiativeText(await readFile(sourcePath, 'utf8'));
  const contentJson = JSON.stringify(content);
  const contentHash = createHash('sha256').update(contentJson).digest('hex');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const article = await tx.safetyGuideArticle.upsert({
      where: { code: 'safe_riding_initiative' },
      create: {
        code: 'safe_riding_initiative',
        title: '摩搭子助手安全骑行倡议',
        summary: content.intro,
      },
      update: { title: '摩搭子助手安全骑行倡议', summary: content.intro, offline_reason: null },
    });
    const existing = await tx.safetyGuideRevision.findUnique({
      where: { article_id_version: { article_id: article.id, version: '2026.08.1' } },
    });
    if (existing && existing.content_hash !== contentHash) {
      throw new Error('版本 2026.08.1 已存在但内容哈希不同，请提高版本号后再导入');
    }
    const revision = existing ?? await tx.safetyGuideRevision.create({
      data: {
        article_id: article.id,
        version: '2026.08.1',
        content_json: content as unknown as Prisma.InputJsonValue,
        source_title: '中华人民共和国道路交通安全法等公开资料',
        source_url: content.sources[0].url,
        source_issuer: '全国人大及公安交管等公开机构',
        content_note: 'V2.2 内容稿系统初始发布版；后续修订通过后台纯文本编辑、复核和发布。',
        content_hash: contentHash,
        reviewed_at: now,
        published_at: now,
        last_verified_at: now,
      },
    });
    await tx.safetyGuideArticle.update({
      where: { id: article.id },
      data: { status: 1, current_revision_id: revision.id, published_at: revision.published_at ?? now, offline_reason: null },
    });
  });
  console.log(`安全骑行倡议已导入并发布：2026.08.1 / sha256:${contentHash}`);
}

main().finally(() => prisma.$disconnect());
