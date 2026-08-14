import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { LOGIN_LEGAL_DOCUMENTS } from '../src/auth/legal-documents.constants';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { RequestIdMiddleware } from '../src/common/request/request-id.middleware';
import { MessageController } from '../src/message/message.controller';
import { NotificationService } from '../src/message/message.service';
import { SubscriptionMessageService } from '../src/message/subscription-message.service';
import { RideController } from '../src/ride/ride.controller';
import { RideService } from '../src/ride/ride.service';
import { assertIsolatedTestDatabaseUrl } from './database-safety';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase('V1 login -> ride -> join -> notification smoke (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let creatorId: bigint;
  let riderId: bigint;
  let rideId: bigint;

  class UserGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      request.user = {
        sub: String(request.headers['x-user-id'] || creatorId),
        role: 0,
        tokenType: 'access',
        jti: 'v1-smoke',
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
      await prisma.user.create({ data: { openid: `v1-creator-${suffix}`, nickname: 'V1 发起人' } })
    ).id;
    riderId = (
      await prisma.user.create({ data: { openid: `v1-rider-${suffix}`, nickname: 'V1 报名人' } })
    ).id;

    const module = await Test.createTestingModule({
      controllers: [AuthController, RideController, MessageController],
      providers: [
        RideService,
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthService,
          useValue: {
            wxLogin: jest.fn().mockResolvedValue({
              access_token: 'test-access-token',
              refresh_token: 'test-refresh-token',
              user: { id: creatorId.toString() },
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            incr: jest.fn().mockResolvedValue(1),
            geoAdd: jest.fn().mockResolvedValue(1),
            geoRemove: jest.fn().mockResolvedValue(1),
          },
        },
        { provide: SubscriptionMessageService, useValue: { push: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(UserGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    const requestId = new RequestIdMiddleware();
    app.use(requestId.use.bind(requestId));
    await app.init();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.notification.deleteMany({ where: { user_id: { in: [creatorId, riderId] } } });
    await prisma.rideParticipant.deleteMany({ where: { user_id: { in: [creatorId, riderId] } } });
    if (rideId) await prisma.ride.delete({ where: { id: rideId } });
    await prisma.user.deleteMany({ where: { id: { in: [creatorId, riderId] } } });
    await app?.close();
    await prisma.$disconnect();
  });

  it('keeps V1 login contract and persists join notification', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/wx-login')
      .send({
        code: 'test-code',
        nickname: 'V1 发起人',
        legal_consent: {
          accepted: true,
          bundle_version: LOGIN_LEGAL_DOCUMENTS.bundleVersion,
          user_agreement_hash: LOGIN_LEGAL_DOCUMENTS.userAgreementHash,
          privacy_policy_hash: LOGIN_LEGAL_DOCUMENTS.privacyPolicyHash,
          safety_notice_hash: LOGIN_LEGAL_DOCUMENTS.safetyNoticeHash,
        },
      })
      .expect(200);
    expect(login.body.data.access_token).toBe('test-access-token');

    const created = await request(app.getHttpServer())
      .post('/api/v1/rides')
      .set('x-user-id', creatorId.toString())
      .send({
        title: 'V1 回归约骑',
        ride_style: 1,
        departure_time: new Date(Date.now() + 86_400_000).toISOString(),
        meetup_address: '测试集合点',
        meetup_lat: 30.25,
        meetup_lng: 120.15,
        destination: '测试终点',
        min_people: 1,
        max_people: 5,
        speed_level: 1,
        city_code: '330100',
      })
      .expect(201);
    rideId = BigInt(created.body.data.id);

    await request(app.getHttpServer())
      .post(`/api/v1/rides/${rideId}/join`)
      .set('x-user-id', riderId.toString())
      .expect(201);

    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('x-user-id', creatorId.toString())
      .expect(200);
    expect(notifications.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ related_type: 'ride', related_id: rideId.toString() }),
      ]),
    );
  });
});
