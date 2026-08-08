import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

/**
 * Local-only fixture data. This script intentionally refuses to run in
 * production and requires an explicit confirmation environment variable.
 */
const prisma = new PrismaClient();
const confirmation = process.env.MODAZI_DEV_SEED_CONFIRM;

if (process.env.NODE_ENV === 'production' || confirmation !== '1') {
  throw new Error(
    '拒绝执行开发 seed：请在本地测试库设置 MODAZI_DEV_SEED_CONFIRM=1，且 NODE_ENV 不能为 production',
  );
}

const devPassword = process.env.MODAZI_DEV_ADMIN_PASSWORD || 'dev-only-password-change-me';
const now = new Date();
const fakeHash = (value: string) => createHash('sha256').update(value).digest('hex');

async function main() {
  const passwordHash = await bcrypt.hash(devPassword, 10);
  const owner = await prisma.adminUser.upsert({
    where: { username: 'dev-owner' },
    update: { password_hash: passwordHash, role: 1, deleted_at: null },
    create: { username: 'dev-owner', password_hash: passwordHash, role: 1 },
  });
  const reviewer = await prisma.adminUser.upsert({
    where: { username: 'dev-reviewer' },
    update: { password_hash: passwordHash, role: 2, deleted_at: null },
    create: { username: 'dev-reviewer', password_hash: passwordHash, role: 2 },
  });

  const rider = await prisma.user.upsert({
    where: { openid: 'dev-openid-rider' },
    update: { nickname: '本地测试骑友', status: 1, forum_invited: true, deleted_at: null },
    create: {
      openid: 'dev-openid-rider',
      nickname: '本地测试骑友',
      status: 1,
      forum_invited: true,
      profile: { create: { city_code: '330100', city: '杭州市' } },
    },
  });
  const secondRider = await prisma.user.upsert({
    where: { openid: 'dev-openid-reviewer' },
    update: { nickname: '本地复核骑友', status: 1, forum_invited: true, deleted_at: null },
    create: {
      openid: 'dev-openid-reviewer',
      nickname: '本地复核骑友',
      status: 1,
      forum_invited: true,
      profile: { create: { city_code: '110100', city: '北京市' } },
    },
  });

  for (const [key, value] of [
    ['route.enabled', 'false'],
    ['regulation.enabled', 'false'],
    ['forum.enabled', 'false'],
    ['forum.publish_mode', 'invite_only'],
  ] as const) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { value, updated_by: owner.id, deleted_at: null },
      create: { key, value, updated_by: owner.id },
    });
  }

  const boardDefinitions = [
    ['new-rider', '新手入门', '骑行基础、安全规范与新手经验交流', 10],
    ['gear', '骑行装备', '头盔、护具与合法骑行装备交流', 20],
    ['maintenance', '维修保养', '车辆检查、维护与常见故障经验', 30],
    ['touring', '摩旅日记', '合规出行见闻与路线故事分享', 40],
  ] as const;
  const boards = new Map<string, bigint>();
  for (const [slug, name, description, sort_order] of boardDefinitions) {
    const board = await prisma.forumBoard.upsert({
      where: { slug },
      update: { name, description, sort_order, status: 1, deleted_at: null },
      create: { slug, name, description, sort_order, status: 1 },
    });
    boards.set(slug, board.id);
  }

  const routeTitle = '开发样例·西湖环线';
  const existingRoute = await prisma.route.findFirst({
    where: { title: routeTitle, deleted_at: null },
    select: { id: true },
  });
  const route = existingRoute
    ? await prisma.route.update({
        where: { id: existingRoute.id },
        data: {
          summary: '仅用于本地手动测试的官方路线样例',
          city_code: '330100',
          city_name: '杭州市',
          type: 'scenic',
          difficulty: 'easy',
          distance_km: 36.5,
          duration_min: 120,
          status: 1,
          maintainer_id: owner.id,
          deleted_at: null,
        },
      })
    : await prisma.route.create({
        data: {
          title: routeTitle,
          summary: '仅用于本地手动测试的官方路线样例',
          city_code: '330100',
          city_name: '杭州市',
          type: 'scenic',
          difficulty: 'easy',
          distance_km: 36.5,
          duration_min: 120,
          status: 1,
          maintainer_id: owner.id,
          published_at: now,
        },
      });
  await prisma.routePoint.deleteMany({ where: { route_id: route.id } });
  await prisma.routePoint.createMany({
    data: [
      { route_id: route.id, order: 1, name: '西湖集结点', latitude: 30.2458, longitude: 120.1508, type: 'start' },
      { route_id: route.id, order: 2, name: '龙井村', latitude: 30.2216, longitude: 120.1225, type: 'waypoint' },
      { route_id: route.id, order: 3, name: '钱塘江观景点', latitude: 30.2088, longitude: 120.2264, type: 'end' },
    ],
  });

  const regulationTitle = '开发样例·杭州市摩托车通行提示';
  const normalizedRegulationTitle = '开发样例杭州市摩托车通行提示';
  const existingRegulation = await prisma.regulation.findFirst({
    where: { normalized_title: normalizedRegulationTitle, deleted_at: null },
    select: { id: true },
  });
  const regulation = existingRegulation
    ? await prisma.regulation.update({
        where: { id: existingRegulation.id },
        data: {
          title: regulationTitle,
          issuer: '本地测试资料（非官方）',
          normalized_issuer: '本地测试资料非官方',
          authority_level: 'local',
          category: 'city_policy',
          scope: 'NATIONAL',
          source_url: 'https://example.invalid/modazi-dev-regulation',
          status: 2,
          last_verified_at: now,
          deleted_at: null,
          created_by: owner.id,
        },
      })
    : await prisma.regulation.create({
        data: {
          title: regulationTitle,
          normalized_title: normalizedRegulationTitle,
          document_no: null,
          document_no_empty_reason: '开发样例无文号',
          issuer: '本地测试资料（非官方）',
          normalized_issuer: '本地测试资料非官方',
          authority_level: 'local',
          category: 'city_policy',
          scope: 'NATIONAL',
          status: 2,
          source_url: 'https://example.invalid/modazi-dev-regulation',
          effective_at: now,
          published_at: now,
          last_verified_at: now,
          review_cycle_days: 90,
          created_by: owner.id,
        },
      });
  const revision = await prisma.regulationRevision.upsert({
    where: { regulation_id_version: { regulation_id: regulation.id, version: 1 } },
    update: {
      summary: '仅用于本地检索和修订流程测试',
      content: '这是本地开发 fixture，不构成法律意见，也不是官方原文。',
      source_snapshot: { source_url: 'https://example.invalid/modazi-dev-regulation' },
      change_note: '开发样例初始化',
      status: 3,
      created_by: owner.id,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      published_at: now,
    },
    create: {
      regulation_id: regulation.id,
      version: 1,
      summary: '仅用于本地检索和修订流程测试',
      content: '这是本地开发 fixture，不构成法律意见，也不是官方原文。',
      source_snapshot: { source_url: 'https://example.invalid/modazi-dev-regulation' },
      change_note: '开发样例初始化',
      status: 3,
      created_by: owner.id,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      published_at: now,
    },
  });
  await prisma.regulation.update({ where: { id: regulation.id }, data: { current_revision_id: revision.id } });
  const tag = await prisma.regulationTag.upsert({
    where: { normalized_name: '通行提示' },
    update: { name: '通行提示' },
    create: { name: '通行提示', normalized_name: '通行提示' },
  });
  await prisma.regulationTagLink.upsert({
    where: { regulation_id_tag_id: { regulation_id: regulation.id, tag_id: tag.id } },
    update: {},
    create: { regulation_id: regulation.id, tag_id: tag.id },
  });

  const boardId = boards.get('new-rider');
  if (!boardId) throw new Error('开发论坛板块初始化失败');
  await prisma.forumPost.upsert({
    where: { user_id_idempotency_key: { user_id: rider.id, idempotency_key: 'dev-approved-post' } },
    update: {
      title: '开发样例·已通过审核的帖子',
      content: '这是本地 fixture，仅用于验证论坛浏览、回复和点赞。',
      status: 1,
      moderation_status: 1,
      published_at: now,
      deleted_at: null,
    },
    create: {
      board_id: boardId,
      user_id: rider.id,
      title: '开发样例·已通过审核的帖子',
      content: '这是本地 fixture，仅用于验证论坛浏览、回复和点赞。',
      status: 1,
      moderation_status: 1,
      moderation_version: 1,
      idempotency_key: 'dev-approved-post',
      submission_hash: fakeHash('dev-approved-post'),
      published_at: now,
    },
  });
  await prisma.forumPost.upsert({
    where: { user_id_idempotency_key: { user_id: secondRider.id, idempotency_key: 'dev-pending-post' } },
    update: {
      title: '开发样例·审核中的帖子',
      content: '这是本地 fixture，仅用于验证待审核状态。',
      status: 1,
      moderation_status: 0,
      published_at: null,
      deleted_at: null,
    },
    create: {
      board_id: boardId,
      user_id: secondRider.id,
      title: '开发样例·审核中的帖子',
      content: '这是本地 fixture，仅用于验证待审核状态。',
      status: 1,
      moderation_status: 0,
      moderation_version: 1,
      idempotency_key: 'dev-pending-post',
      submission_hash: fakeHash('dev-pending-post'),
    },
  });

  console.log('开发 fixture 已幂等写入：管理员、测试用户、路线、法规和论坛样例已准备');
  console.log('功能开关保持安全默认关闭；如需手动验证受控模块，请通过管理后台显式开启。');
}

main()
  .catch((error) => {
    console.error('开发 fixture 写入失败:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
