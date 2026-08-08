import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtGuard } from '../src/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '../src/admin/guards/admin-roles.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../src/common/feature-flag/feature-flag.guard';
import { AppException } from '../src/common/exceptions/app.exception';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { OperationLogService } from '../src/common/operation-log/operation-log.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';
import { AdminRouteController } from '../src/route/admin-route.controller';
import { AdminRouteService } from '../src/route/admin-route.service';
import { OptionalJwtAuthGuard } from '../src/route/guards/optional-jwt-auth.guard';
import { RouteCacheService } from '../src/route/route-cache.service';
import { RouteController } from '../src/route/route.controller';
import { RouteService } from '../src/route/route.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase('route curated vertical flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminId: bigint;
  let userId: bigint;
  let rideId: bigint;
  let routeEnabled = true;

  class FeatureGuard implements CanActivate {
    canActivate(): boolean {
      if (!routeEnabled) {
        throw new AppException(52001, '功能暂未开放', 503);
      }
      return true;
    }
  }
  class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      req.user = {
        sub: adminId.toString(),
        role: Number(req.headers['x-admin-role'] ?? 9),
        type: 'admin',
      };
      return true;
    }
  }
  class UserGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      context.switchToHttp().getRequest().user = {
        sub: userId.toString(),
        role: 0,
        tokenType: 'access',
        jti: 'test',
      };
      return true;
    }
  }
  class OptionalUserGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      if (req.headers['x-user-id'])
        req.user = { sub: userId.toString(), role: 0, tokenType: 'access', jti: 'test' };
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
    const admin = await prisma.adminUser.create({
      data: { username: `route-e2e-${suffix}`, password_hash: 'test-only', role: 9 },
    });
    adminId = admin.id;
    const user = await prisma.user.create({
      data: { openid: `route-e2e-${suffix}`, nickname: '路线测试用户' },
    });
    userId = user.id;
    const ride = await prisma.ride.create({
      data: {
        user_id: userId,
        title: '西湖关联约骑',
        ride_style: 3,
        departure_time: new Date(Date.now() + 86_400_000),
        meetup_address: '西湖文化广场',
        meetup_lat: '30.2800000',
        meetup_lng: '120.1600000',
        destination: '龙井村',
        min_people: 2,
        max_people: 8,
        speed_level: 1,
        status: 1,
        audit_status: 1,
        join_count: 1,
        city_code: '330100',
      },
    });
    rideId = ride.id;

    const cache = {
      getList: jest.fn().mockResolvedValue(null),
      setList: jest.fn(),
      getDetail: jest.fn().mockResolvedValue(null),
      setDetail: jest.fn(),
      invalidate: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [RouteController, AdminRouteController, RideController],
      providers: [
        Reflector,
        RouteService,
        AdminRouteService,
        OperationLogService,
        { provide: PrismaService, useValue: prisma },
        { provide: RouteCacheService, useValue: cache },
        AdminRolesGuard,
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
      .overrideGuard(OptionalJwtAuthGuard)
      .useClass(OptionalUserGuard)
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
    await prisma.routeFavorite.deleteMany({ where: { user_id: userId } });
    await prisma.routeRideLink.deleteMany({ where: { ride_id: rideId } });
    await prisma.routePoint.deleteMany({ where: { route: { maintainer_id: adminId } } });
    await prisma.route.deleteMany({ where: { maintainer_id: adminId } });
    await prisma.operationLog.deleteMany({ where: { admin_id: adminId } });
    await prisma.ride.delete({ where: { id: rideId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.adminUser.delete({ where: { id: adminId } });
    await app?.close();
    await prisma.$disconnect();
  });

  it('draft -> publish -> browse -> favorite -> related ride -> offline, while V1 stays available', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/admin/routes')
      .set('x-request-id', 'route-create-1')
      .send({
        title: '西湖龙井精选环线',
        summary: '官方运营精选',
        cover_image: 'https://example.com/route.jpg',
        images: [],
        city_code: '330100',
        city_name: '杭州',
        type: 'scenic',
        difficulty: 'easy',
        distance_km: 28.5,
        duration_min: 120,
        polyline: [
          { latitude: 30.25, longitude: 120.15 },
          { latitude: 30.2, longitude: 120.1 },
        ],
        road_condition: '铺装道路为主',
        suitable_motorcycles: '街车、踏板、ADV',
        best_season: '春秋',
        safety_notice: '景区弯道较多，请减速并留意行人',
        sort_weight: 100,
        points: [
          { order: 0, name: '西湖文化广场', latitude: 30.25, longitude: 120.15, type: 'start' },
          { order: 1, name: '龙井村', latitude: 30.2, longitude: 120.1, type: 'end' },
        ],
        related_ride_ids: [rideId.toString()],
      })
      .expect(201);
    const routeId = draft.body.data.id as string;
    expect(draft.body.data.status).toBe(0);

    const hidden = await request(app.getHttpServer()).get('/api/v1/routes').expect(200);
    expect(hidden.body.data.items).toEqual([]);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/routes/${routeId}/publish`)
      .set('x-admin-role', '1')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/routes/${routeId}/publish`)
      .set('x-admin-role', '9')
      .set('x-request-id', 'route-publish-1')
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/routes?city_code=330100&type=scenic&difficulty=easy')
      .expect(200);
    expect(list.body.data.items).toHaveLength(1);
    const detail = await request(app.getHttpServer()).get(`/api/v1/routes/${routeId}`).expect(200);
    expect(detail.body.data.points.map((point: { type: string }) => point.type)).toEqual([
      'start',
      'end',
    ]);

    const favorite = await request(app.getHttpServer())
      .put(`/api/v1/routes/${routeId}/favorite`)
      .expect(200);
    const duplicate = await request(app.getHttpServer())
      .put(`/api/v1/routes/${routeId}/favorite`)
      .expect(200);
    expect(favorite.body.data.favorite_count).toBe(1);
    expect(duplicate.body.data.favorite_count).toBe(1);
    const afterFavorite = await request(app.getHttpServer())
      .get(`/api/v1/routes/${routeId}`)
      .expect(200);
    expect(afterFavorite.body.data.updated_at).toBe(detail.body.data.updated_at);

    const unfavorite = await request(app.getHttpServer())
      .delete(`/api/v1/routes/${routeId}/favorite`)
      .expect(200);
    const duplicateUnfavorite = await request(app.getHttpServer())
      .delete(`/api/v1/routes/${routeId}/favorite`)
      .expect(200);
    expect(unfavorite.body.data.favorite_count).toBe(0);
    expect(duplicateUnfavorite.body.data.favorite_count).toBe(0);
    await request(app.getHttpServer()).put(`/api/v1/routes/${routeId}/favorite`).expect(200);

    const related = await request(app.getHttpServer())
      .get(`/api/v1/routes/${routeId}/related-rides`)
      .expect(200);
    expect(related.body.data.items[0].id).toBe(rideId.toString());

    await request(app.getHttpServer())
      .post(`/api/v1/admin/routes/${routeId}/offline`)
      .set('x-request-id', 'route-offline-1')
      .send({ reason: '道路施工，暂时下架' })
      .expect(201);
    await request(app.getHttpServer()).get(`/api/v1/routes/${routeId}`).expect(410);
    const afterOffline = await request(app.getHttpServer()).get('/api/v1/routes').expect(200);
    expect(afterOffline.body.data.items).toEqual([]);

    const audit = await prisma.operationLog.findMany({
      where: { admin_id: adminId, object_id: routeId },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((item) => item.action)).toEqual(
      expect.arrayContaining(['route.publish', 'route.offline']),
    );
    expect(audit.find((item) => item.action === 'route.publish')?.request_id).toBe(
      'route-publish-1',
    );

    routeEnabled = false;
    await request(app.getHttpServer()).get('/api/v1/routes').expect(503);
    await request(app.getHttpServer()).get('/api/v1/rides').expect(200);
    routeEnabled = true;
  });
});
