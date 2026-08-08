import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtGuard } from '../src/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../src/admin/guards/admin-roles.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { AppException } from '../src/common/exceptions/app.exception';
import { FeatureFlagGuard } from '../src/common/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '../src/common/feature-flag/feature-flag.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { OperationLogService } from '../src/common/operation-log/operation-log.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';
import { IdempotencyService } from '../src/common/resilience/idempotency.service';
import { RateLimitService } from '../src/common/resilience/rate-limit.service';
import { AdminForumController } from '../src/forum/admin-forum.controller';
import { AdminForumService } from '../src/forum/admin-forum.service';
import { ForumAccessService } from '../src/forum/forum-access.service';
import { ForumConfigService } from '../src/forum/forum-config.service';
import { ForumContentSanitizer } from '../src/forum/forum-content-sanitizer';
import { ForumController } from '../src/forum/forum.controller';
import { ForumModerationGateway } from '../src/forum/forum-moderation.gateway';
import { ForumModerationMetricsService } from '../src/forum/forum-moderation-metrics.service';
import { ForumModerationService } from '../src/forum/forum-moderation.service';
import { ForumService } from '../src/forum/forum.service';
import { OptionalForumJwtGuard } from '../src/forum/guards/optional-forum-jwt.guard';
import { ReportController } from '../src/report/report.controller';
import { ReportService } from '../src/report/report.service';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase('forum controlled beta vertical flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminId: bigint;
  let authorId: bigint;
  let otherId: bigint;
  let boardId: bigint;
  let authorFileId: bigint;
  let otherFileId: bigint;
  let forumEnabled = true;
  let writeEnabled = true;
  let rateBlocked = false;
  let moderationDecision: 'pass' | 'reject' | 'error' = 'error';

  class FeatureGuard implements CanActivate {
    canActivate() {
      if (!forumEnabled) throw new AppException(52001, '功能暂未开放', 503);
      return true;
    }
  }
  class UserGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        sub: String(req.headers['x-user-id'] || authorId),
        role: 0,
        tokenType: 'access',
        jti: 'forum-e2e',
      };
      return true;
    }
  }
  class OptionalUserGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      if (req.headers['x-user-id'])
        req.user = {
          sub: String(req.headers['x-user-id']),
          role: 0,
          tokenType: 'access',
          jti: 'forum-optional',
        };
      return true;
    }
  }
  class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        sub: String(req.headers['x-admin-id'] || adminId),
        role: Number(req.headers['x-admin-role'] || 1),
        type: 'admin',
      };
      return true;
    }
  }

  beforeAll(async () => {
    const safeUrl = assertIsolatedTestDatabaseUrl(testDatabaseUrl).toString();
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = safeUrl;
    prisma = new PrismaClient();
    await prisma.$connect();
    process.env.DATABASE_URL = previous;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    adminId = (
      await prisma.adminUser.create({
        data: { username: `forum-admin-${suffix}`, password_hash: 'test', role: 1 },
      })
    ).id;
    authorId = (
      await prisma.user.create({
        data: { openid: `forum-author-${suffix}`, nickname: '受邀作者', forum_invited: true },
      })
    ).id;
    otherId = (
      await prisma.user.create({
        data: { openid: `forum-other-${suffix}`, nickname: '举报用户', forum_invited: true },
      })
    ).id;
    boardId = (await prisma.forumBoard.findFirstOrThrow({ where: { slug: 'new-rider' } })).id;
    authorFileId = (
      await prisma.fileRecord.create({
        data: {
          user_id: authorId,
          file_key: `forum/2026/08/01/${authorId}/123e4567-e89b-12d3-a456-426614174001.jpg`,
          file_url: 'https://origin.example/forum-author.jpg',
          cdn_url: 'https://cdn.example/forum-author.jpg',
          file_size: 1024,
          file_type: 'image/jpeg',
        },
      })
    ).id;
    otherFileId = (
      await prisma.fileRecord.create({
        data: {
          user_id: otherId,
          file_key: `forum/2026/08/01/${otherId}/123e4567-e89b-12d3-a456-426614174002.jpg`,
          file_url: 'https://origin.example/forum-other.jpg',
          cdn_url: 'https://cdn.example/forum-other.jpg',
          file_size: 1024,
          file_type: 'image/jpeg',
        },
      })
    ).id;

    const gateway = {
      checkText: jest.fn(async () =>
        moderationDecision === 'pass'
          ? { decision: 'pass' }
          : moderationDecision === 'reject'
            ? { decision: 'reject', reason: '测试违规内容' }
            : { decision: 'error', code: 'provider_unavailable' },
      ),
      checkImage: jest.fn(async () =>
        moderationDecision === 'pass'
          ? { decision: 'pass' }
          : moderationDecision === 'reject'
            ? { decision: 'reject', reason: '测试违规图片' }
            : { decision: 'error', code: 'provider_unavailable' },
      ),
    };
    const flags = {
      isEnabled: jest.fn(async (key: string) =>
        key === 'forum.enabled'
          ? forumEnabled
          : key === 'forum.write_enabled'
            ? writeEnabled
            : false,
      ),
      get: jest.fn(async () => 'all'),
    };
    const rateLimits = {
      consume: jest.fn(async () => {
        if (rateBlocked) throw new AppException(42901, '请求过于频繁，请稍后再试', 429);
        return { allowed: true, remaining: 1, retryAfterSeconds: 1 };
      }),
    };
    const idempotency = {
      execute: jest.fn(async (_input, operation) => ({
        value: await operation(),
        replayed: false,
      })),
    };
    const config = {
      rates: jest.fn(async () => ({
        postMinute: 100,
        postDay: 100,
        replyTenSeconds: 100,
        replyDay: 100,
        likeMinute: 100,
        reportMinute: 100,
      })),
    };
    const module = await Test.createTestingModule({
      controllers: [ForumController, AdminForumController, ReportController, RideController],
      providers: [
        Reflector,
        ForumService,
        AdminForumService,
        ForumAccessService,
        ForumContentSanitizer,
        ForumModerationMetricsService,
        ForumModerationService,
        OperationLogService,
        ReportService,
        AdminRolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ForumModerationGateway, useValue: gateway },
        { provide: FeatureFlagService, useValue: flags },
        { provide: RateLimitService, useValue: rateLimits },
        { provide: IdempotencyService, useValue: idempotency },
        { provide: ForumConfigService, useValue: config },
        {
          provide: RideService,
          useValue: { list: () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } }) },
        },
      ],
    })
      .overrideGuard(FeatureFlagGuard)
      .useClass(FeatureGuard)
      .overrideGuard(JwtAuthGuard)
      .useClass(UserGuard)
      .overrideGuard(OptionalForumJwtGuard)
      .useClass(OptionalUserGuard)
      .overrideGuard(AdminJwtGuard)
      .useClass(AdminGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    const requestId = new RequestIdMiddleware();
    app.use(requestId.use.bind(requestId));
    await app.init();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.report.deleteMany({ where: { reporter_user_id: { in: [authorId, otherId] } } });
    await prisma.forumLike.deleteMany({ where: { user_id: { in: [authorId, otherId] } } });
    await prisma.forumReply.deleteMany({ where: { user_id: { in: [authorId, otherId] } } });
    await prisma.forumPost.deleteMany({ where: { user_id: { in: [authorId, otherId] } } });
    await prisma.userRestriction.deleteMany({ where: { user_id: { in: [authorId, otherId] } } });
    await prisma.fileRecord.deleteMany({ where: { id: { in: [authorFileId, otherFileId] } } });
    await prisma.operationLog.deleteMany({ where: { admin_id: adminId } });
    await prisma.user.deleteMany({ where: { id: { in: [authorId, otherId] } } });
    await prisma.adminUser.delete({ where: { id: adminId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('never leaks moderation failures, rejects IDOR/XSS/images, and safely retries', async () => {
    moderationDecision = 'error';
    const created = await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'pending-post')
      .send({
        board_id: boardId.toString(),
        title: '新手骑行安全经验',
        content: '出发前检查轮胎制动和灯光状态。',
        image_ids: [],
      })
      .expect(201);
    const pendingId = created.body.data.id as string;
    expect(created.body.data.state).toMatchObject({
      moderation_status: 0,
      manual_review_required: true,
    });
    expect(
      (await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(200)).body.data.items,
    ).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/v1/forum/posts/${pendingId}`)
      .set('x-user-id', otherId.toString())
      .expect(404);
    await request(app.getHttpServer()).get('/api/v1/forum/search').query({ q: '安全' }).expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/forum/posts/${pendingId}`)
      .set('x-user-id', otherId.toString())
      .set('idempotency-key', 'idor-edit')
      .send({ title: '越权修改标题内容' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/forum/posts/${pendingId}`)
      .set('x-user-id', otherId.toString())
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'xss-post')
      .send({
        board_id: boardId.toString(),
        title: '包含危险脚本测试',
        content: '<script>alert(1)</script>这是危险正文',
        image_ids: [],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'foreign-image')
      .send({
        board_id: boardId.toString(),
        title: '他人图片越权测试',
        content: '不能引用其他用户上传的图片文件。',
        image_ids: [otherFileId.toString()],
      })
      .expect(400);
    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/forum/moderation?queue=errors')
      .set('x-admin-id', adminId.toString())
      .expect(200);
    expect(queue.body.data.list.some((item: { id: string }) => item.id === pendingId)).toBe(true);
    moderationDecision = 'pass';
    await request(app.getHttpServer())
      .post(`/api/v1/admin/forum/moderation/post/${pendingId}/retry`)
      .set('x-admin-id', adminId.toString())
      .set('x-request-id', 'forum-retry-e2e')
      .send({ reason: '审核服务恢复后人工补偿重试' })
      .expect(201);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(200)).body.data.items[0]
        .id,
    ).toBe(pendingId);
  });

  it('publishes text/images -> idempotent like/reply -> report -> offline, enforcing mute and rate limits', async () => {
    moderationDecision = 'pass';
    const payload = {
      board_id: boardId.toString(),
      title: '长途骑行装备整理',
      content: '这是一份经过实际骑行验证的装备整理清单。',
      image_ids: [authorFileId.toString()],
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'image-post')
      .send(payload)
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'image-post')
      .send(payload)
      .expect(201);
    expect(duplicate.body.data.replayed).toBe(true);
    expect(duplicate.body.data.id).toBe(first.body.data.id);
    const postId = first.body.data.id as string;
    expect(
      await prisma.forumPost.count({ where: { user_id: authorId, idempotency_key: 'image-post' } }),
    ).toBe(1);
    const like1 = await request(app.getHttpServer())
      .put(`/api/v1/forum/posts/${postId}/like`)
      .set('x-user-id', otherId.toString())
      .expect(200);
    const like2 = await request(app.getHttpServer())
      .put(`/api/v1/forum/posts/${postId}/like`)
      .set('x-user-id', otherId.toString())
      .expect(200);
    expect(like1.body.data.like_count).toBe(1);
    expect(like2.body.data.like_count).toBe(1);
    const reply1 = await request(app.getHttpServer())
      .post(`/api/v1/forum/posts/${postId}/replies`)
      .set('x-user-id', otherId.toString())
      .set('idempotency-key', 'reply-once')
      .send({ content: '这个装备检查清单很实用。' })
      .expect(201);
    const reply2 = await request(app.getHttpServer())
      .post(`/api/v1/forum/posts/${postId}/replies`)
      .set('x-user-id', otherId.toString())
      .set('idempotency-key', 'reply-once')
      .send({ content: '这个装备检查清单很实用。' })
      .expect(201);
    expect(reply2.body.data.replayed).toBe(true);
    expect(
      (await request(app.getHttpServer()).get(`/api/v1/forum/posts/${postId}/replies`).expect(200))
        .body.data.items,
    ).toHaveLength(1);
    const muted = await request(app.getHttpServer())
      .post(`/api/v1/admin/forum/users/${otherId}/restrictions`)
      .set('x-admin-id', adminId.toString())
      .set('x-request-id', 'forum-mute-e2e')
      .send({
        starts_at: new Date(Date.now() - 5_000).toISOString(),
        ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        reason: '测试禁言绕过防护',
      })
      .expect(201);
    expect(
      await prisma.userRestriction.count({
        where: { user_id: otherId, type: 'forum_mute', deleted_at: null },
      }),
    ).toBe(1);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/forum/boards')
          .set('x-user-id', otherId.toString())
          .expect(200)
      ).body.data.capability.reason,
    ).toBe('muted');
    await request(app.getHttpServer())
      .post(`/api/v1/forum/posts/${postId}/replies`)
      .set('x-user-id', otherId.toString())
      .set('idempotency-key', 'muted-reply')
      .send({ content: '禁言后不应发布成功。' })
      .expect(423);
    await request(app.getHttpServer())
      .delete(`/api/v1/forum/replies/${reply1.body.data.id}`)
      .set('x-user-id', otherId.toString())
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/forum/users/${otherId}/restrictions/${muted.body.data.id}`)
      .set('x-admin-id', adminId.toString())
      .send({ reason: '测试解除禁言并恢复发布权限' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/forum/posts/${postId}/replies`)
      .set('x-user-id', otherId.toString())
      .set('idempotency-key', 'unmuted-reply')
      .send({ content: '解除禁言后可以重新提交回复。' })
      .expect(201);
    rateBlocked = true;
    await request(app.getHttpServer())
      .put(`/api/v1/forum/posts/${postId}/like`)
      .set('x-user-id', authorId.toString())
      .expect(429);
    rateBlocked = false;
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('x-user-id', otherId.toString())
      .send({
        content_type: 'forum_post',
        content_id: postId,
        reason: 1,
        description: '测试举报证据',
        source: 'forum',
      })
      .expect(201);
    const reports = await request(app.getHttpServer())
      .get('/api/v1/admin/forum/reports?status=0')
      .set('x-admin-id', adminId.toString())
      .expect(200);
    const reportItem = reports.body.data.list.find(
      (item: { content_id: string }) => item.content_id === postId,
    );
    expect(reportItem.evidence_snapshot.title_hash).toHaveLength(64);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/forum/content/post/${postId}/offline`)
      .set('x-admin-id', adminId.toString())
      .set('x-request-id', 'forum-offline-e2e')
      .send({ reason: '举报核实后下架' })
      .expect(201);
    await request(app.getHttpServer()).get(`/api/v1/forum/posts/${postId}`).expect(410);
    expect(
      (
        await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(200)
      ).body.data.items.some((item: { id: string }) => item.id === postId),
    ).toBe(false);
    const logs = await prisma.operationLog.findMany({
      where: { admin_id: adminId },
      select: { action: true, request_id: true },
    });
    expect(logs.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'forum.post.retry',
        'forum.user.mute',
        'forum.user.unmute',
        'forum.post.offline',
      ]),
    );
    expect(logs.find((item) => item.action === 'forum.post.offline')?.request_id).toBe(
      'forum-offline-e2e',
    );
  });

  it('supports read-only recovery and closes forum without affecting V1 rides', async () => {
    moderationDecision = 'pass';
    const visible = await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'readonly-visible')
      .send({
        board_id: boardId.toString(),
        title: '只读恢复浏览测试',
        content: '审核服务故障后仍可安全恢复公开内容浏览。',
        image_ids: [],
      })
      .expect(201);
    const postId = visible.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/forum/boards/${boardId}/status`)
      .set('x-admin-id', adminId.toString())
      .send({ status: 0, reason: '板块临时治理演练' })
      .expect(201);
    expect(
      (
        await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(200)
      ).body.data.items.some((item: { id: string }) => item.id === postId),
    ).toBe(false);
    await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'closed-board-write')
      .send({
        board_id: boardId.toString(),
        title: '关闭板块写入测试',
        content: '板块关闭后不能继续提交新的帖子内容。',
        image_ids: [],
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/forum/boards/${boardId}/status`)
      .set('x-admin-id', adminId.toString())
      .send({ status: 1, reason: '板块治理演练结束' })
      .expect(201);
    writeEnabled = false;
    expect(
      (
        await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(200)
      ).body.data.items.some((item: { id: string }) => item.id === postId),
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/forum/posts')
      .set('x-user-id', authorId.toString())
      .set('idempotency-key', 'readonly-write')
      .send({
        board_id: boardId.toString(),
        title: '只读写入应被拒绝',
        content: '当前只读状态不能新增任何论坛帖子。',
        image_ids: [],
      })
      .expect(503);
    writeEnabled = true;
    forumEnabled = false;
    await request(app.getHttpServer()).get('/api/v1/forum/posts').expect(503);
    await request(app.getHttpServer()).get('/api/v1/rides').expect(200);
    forumEnabled = true;
  });
});
