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
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { OperationLogService } from '../src/common/operation-log/operation-log.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';
import { RateLimitService } from '../src/common/resilience/rate-limit.service';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';
import { AdminRegulationController } from '../src/regulation/admin-regulation.controller';
import { AdminRegulationService } from '../src/regulation/admin-regulation.service';
import { RegulationController } from '../src/regulation/regulation.controller';
import { RegulationImportService } from '../src/regulation/regulation-import.service';
import { RegulationService } from '../src/regulation/regulation.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

describeDatabase('regulation searchable revision flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let creatorId: bigint;
  let reviewerId: bigint;
  let publisherId: bigint;
  let userId: bigint;
  let enabled = true;
  class FeatureGuard implements CanActivate {
    canActivate() {
      if (!enabled) throw new AppException(52001, '功能暂未开放', 503);
      return true;
    }
  }
  class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        sub: String(req.headers['x-admin-id']),
        role: Number(req.headers['x-admin-role']),
        type: 'admin',
      };
      return true;
    }
  }
  class UserGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest().user = {
        sub: userId.toString(),
        role: 0,
        tokenType: 'access',
        jti: 'regulation-e2e',
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
    creatorId = (
      await prisma.adminUser.create({
        data: { username: `reg-create-${suffix}`, password_hash: 'test', role: 1 },
      })
    ).id;
    reviewerId = (
      await prisma.adminUser.create({
        data: { username: `reg-review-${suffix}`, password_hash: 'test', role: 1 },
      })
    ).id;
    publisherId = (
      await prisma.adminUser.create({
        data: { username: `reg-publish-${suffix}`, password_hash: 'test', role: 9 },
      })
    ).id;
    userId = (
      await prisma.user.create({ data: { openid: `reg-user-${suffix}`, nickname: '法规测试用户' } })
    ).id;
    const module = await Test.createTestingModule({
      controllers: [RegulationController, AdminRegulationController, RideController],
      providers: [
        Reflector,
        RegulationService,
        AdminRegulationService,
        RegulationImportService,
        OperationLogService,
        AdminRolesGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RateLimitService,
          useValue: { consume: jest.fn().mockResolvedValue({ allowed: true }) },
        },
        {
          provide: RideService,
          useValue: { list: () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } }) },
        },
      ],
    })
      .overrideGuard(FeatureFlagGuard)
      .useClass(FeatureGuard)
      .overrideGuard(AdminJwtGuard)
      .useClass(AdminGuard)
      .overrideGuard(JwtAuthGuard)
      .useClass(UserGuard)
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
    const regulations = await prisma.regulation.findMany({
      where: { created_by: { in: [creatorId, reviewerId, publisherId] } },
      select: { id: true },
    });
    const ids = regulations.map((item) => item.id);
    await prisma.regulationFeedback.deleteMany({ where: { regulation_id: { in: ids } } });
    await prisma.regulationImportTask.deleteMany({ where: { admin_id: creatorId } });
    await prisma.regulation.updateMany({
      where: { id: { in: ids } },
      data: { current_revision_id: null, replacement_regulation_id: null },
    });
    await prisma.regulation.deleteMany({ where: { id: { in: ids } } });
    await prisma.operationLog.deleteMany({
      where: { admin_id: { in: [creatorId, reviewerId, publisherId] } },
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.adminUser.deleteMany({
      where: { id: { in: [creatorId, reviewerId, publisherId] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('imports draft -> different reviewer -> super-admin publish -> search/source/feedback -> immutable revision', async () => {
    const headers = [
      'title',
      'document_no',
      'document_no_empty_reason',
      'issuer',
      'authority_level',
      'category',
      'scope',
      'regions',
      'tags',
      'source_url',
      'published_at',
      'effective_at',
      'expired_at',
      'effective_note',
      'last_verified_at',
      'review_cycle_days',
      'replacement_regulation_id',
      'summary',
      'content',
      'change_note',
    ];
    const values = [
      '摩托车驾驶证申领和使用规定测试条目',
      '测试公通字第2026号',
      '',
      '公安部',
      'departmental',
      'license',
      'NATIONAL',
      '',
      '驾驶证|摩托车|记分',
      'https://www.gov.cn/zhengce/example',
      '2026-01-01',
      '2026-02-01',
      '',
      '',
      '2026-07-31',
      '90',
      '',
      '驾驶证申领和记分规则官方索引',
      '第一版结构化正文，仅用于自动化测试。',
      '首次导入',
    ];
    const csv = `${headers.join(',')}\n${values.map(csvCell).join(',')}\n`;
    const upload = await request(app.getHttpServer())
      .post('/api/v1/admin/regulations/imports')
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .set('idempotency-key', 'regulation-e2e-import')
      .attach('file', Buffer.from(csv), { filename: 'regulations.csv', contentType: 'text/csv' })
      .expect(201);
    expect(upload.body.data.error_rows).toBe(0);
    const taskId = upload.body.data.id;
    const repeated = await request(app.getHttpServer())
      .post('/api/v1/admin/regulations/imports')
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .set('idempotency-key', 'regulation-e2e-import')
      .attach('file', Buffer.from(csv), { filename: 'regulations.csv', contentType: 'text/csv' })
      .expect(201);
    expect(repeated.body.data.duplicate).toBe(true);
    expect(repeated.body.data.id).toBe(taskId);
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/imports/${taskId}/confirm`)
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '确认导入测试草稿' })
      .expect(201);
    expect(confirmed.body.data.imported_count).toBe(1);
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/regulations')
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .expect(200);
    const regulation = list.body.data.list.find((item: { title: string }) =>
      item.title.includes('测试条目'),
    );
    expect(regulation).toBeDefined();
    const regulationId = regulation.id;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${regulationId}/submit-review`)
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '提交另一管理员复核' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${regulationId}/review`)
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '错误的同人复核' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${regulationId}/review`)
      .set('x-admin-id', reviewerId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '来源与字段复核通过' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${regulationId}/publish`)
      .set('x-admin-id', reviewerId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '越权发布' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${regulationId}/publish`)
      .set('x-admin-id', publisherId.toString())
      .set('x-admin-role', '9')
      .send({ reason: '超级管理员确认发布' })
      .expect(201);
    const searchResult = await request(app.getHttpServer())
      .get('/api/v1/regulations/search')
      .query({ keyword: '驾驶证记分' })
      .expect(200);
    expect(searchResult.body.data.items[0].id).toBe(regulationId);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/regulations/${regulationId}`)
      .expect(200);
    expect(detail.body.data.source_url).toContain('gov.cn');
    expect(detail.body.data.content).toContain('第一版');
    await request(app.getHttpServer())
      .post(`/api/v1/regulations/${regulationId}/feedback`)
      .send({ type: 'link_broken' })
      .expect(201);
    const feedbackQueue = await request(app.getHttpServer())
      .get('/api/v1/admin/regulations/feedbacks')
      .set('x-admin-id', reviewerId.toString())
      .set('x-admin-role', '1')
      .expect(200);
    const feedback = feedbackQueue.body.data.list.find(
      (queueItem: { regulation: { id: string } }) => queueItem.regulation.id === regulationId,
    );
    expect(feedback.type).toBe('link_broken');
    expect(feedback.source_url).toContain('gov.cn');
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/feedbacks/${feedback.id}/resolve`)
      .set('x-admin-id', reviewerId.toString())
      .set('x-admin-role', '1')
      .send({ reason: '已人工核对官方来源' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/regulations/${regulationId}`)
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .send({ content: '第二版结构化正文', change_note: '修订测试正文' })
      .expect(200);
    const afterRevision = await request(app.getHttpServer())
      .get(`/api/v1/regulations/${regulationId}`)
      .expect(200);
    expect(afterRevision.body.data.content).toContain('第一版');
    const adminDetail = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulations/${regulationId}`)
      .set('x-admin-id', creatorId.toString())
      .set('x-admin-role', '1')
      .expect(200);
    expect(
      adminDetail.body.data.revisions.map((revision: { version: number }) => revision.version),
    ).toEqual([2, 1]);
    expect(adminDetail.body.data.revisions[1].source_snapshot.published_at).toBeTruthy();
    expect(adminDetail.body.data.revisions[1].source_snapshot.expired_at).toBeNull();
    const actions = await prisma.operationLog.findMany({
      where: {
        object_type: { in: ['regulation', 'regulation_import'] },
        object_id: { in: [regulationId, taskId] },
      },
      select: { action: true, request_id: true },
    });
    expect(actions.some((item) => item.action === 'regulation.publish' && item.request_id)).toBe(
      true,
    );
  });

  it('filters expired content by default and closes only regulation when the flag is off', async () => {
    const target = await prisma.regulation.findFirst({
      where: { created_by: creatorId, current_revision_id: { not: null } },
      orderBy: { id: 'desc' },
    });
    expect(target).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${target!.id}/expire`)
      .set('x-admin-id', publisherId.toString())
      .set('x-admin-role', '9')
      .send({ reason: '法规有效期结束' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${target!.id}/expire`)
      .set('x-admin-id', publisherId.toString())
      .set('x-admin-role', '9')
      .send({ reason: '重复失效不应成功' })
      .expect(409);
    const defaults = await request(app.getHttpServer()).get('/api/v1/regulations').expect(200);
    expect(
      defaults.body.data.items.some((item: { id: string }) => item.id === target!.id.toString()),
    ).toBe(false);
    const expired = await request(app.getHttpServer())
      .get('/api/v1/regulations')
      .query({ status: 3 })
      .expect(200);
    expect(
      expired.body.data.items.some((item: { id: string }) => item.id === target!.id.toString()),
    ).toBe(true);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/regulations/${target!.id}/offline`)
      .set('x-admin-id', publisherId.toString())
      .set('x-admin-role', '9')
      .send({ reason: '运营确认下架测试' })
      .expect(201);
    const lifecycleLogs = await prisma.operationLog.findMany({
      where: { object_type: 'regulation', object_id: target!.id.toString() },
      select: { action: true },
    });
    expect(lifecycleLogs.map((item) => item.action)).toEqual(
      expect.arrayContaining(['regulation.publish', 'regulation.expire', 'regulation.offline']),
    );
    enabled = false;
    await request(app.getHttpServer()).get('/api/v1/regulations').expect(503);
    await request(app.getHttpServer()).get('/api/v1/rides').expect(200);
    enabled = true;
  });
});
