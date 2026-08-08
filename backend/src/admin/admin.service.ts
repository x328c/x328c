import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { OperationLogService } from '../common/operation-log/operation-log.service';
import { OperationActorContext } from '../common/operation-log/operation-log.types';
import { AdminContentQueryDto, AdminLoginDto, AdminUserQueryDto } from './dto';
import { AdminJwtPayload } from './entity/admin-token.entity';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly operationLogs: OperationLogService,
  ) {}
  async login(dto: AdminLoginDto, ip?: string) {
    const admin = await this.prisma.adminUser.findFirst({
      where: { username: dto.username, deleted_at: null },
    });
    if (!admin) throw new AppException(7001, '管理员不存在', HttpStatus.NOT_FOUND);
    if (!(await bcrypt.compare(dto.password, admin.password_hash)))
      throw new AppException(7002, '密码错误', HttpStatus.UNAUTHORIZED);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { last_login_at: new Date(), last_login_ip: ip ?? null },
    });
    const payload: AdminJwtPayload = { sub: admin.id.toString(), role: admin.role, type: 'admin' };
    const access_token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('ADMIN_JWT_SECRET'),
      expiresIn: this.config.get('ADMIN_JWT_EXPIRES_IN', '8h'),
    });
    return {
      access_token,
      admin: { id: admin.id.toString(), username: admin.username, role: admin.role },
    };
  }
  async rides(query: AdminContentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RideWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { user: { nickname: { contains: query.keyword } } },
            ],
          }
        : {}),
      ...(query.start_time || query.end_time
        ? {
            created_at: {
              ...(query.start_time ? { gte: new Date(query.start_time) } : {}),
              ...(query.end_time ? { lte: new Date(query.end_time) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ride.findMany({
        where,
        include: { user: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ride.count({ where }),
    ]);
    return {
      list: items.map((x) => ({
        id: x.id.toString(),
        title: x.title,
        status: x.status,
        audit_status: x.audit_status,
        join_count: x.join_count,
        departure_time: x.departure_time,
        created_at: x.created_at,
        creator: { id: x.user.id.toString(), nickname: x.user.nickname },
      })),
      pagination: { page, pageSize, total },
    };
  }
  async offlineRide(id: bigint, audit: OperationActorContext) {
    const ride = await this.prisma.ride.findFirst({ where: { id, deleted_at: null } });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({ where: { id }, data: { status: 5, audit_status: 2 } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'ride.offline',
        objectType: 'ride',
        objectId: id.toString(),
        reason: 'V1 管理接口下架',
        beforeSummary: { status: ride.status, audit_status: ride.audit_status },
        afterSummary: { status: 5, audit_status: 2 },
      });
    });
    await this.redis.geoRemove(`geo:rides:${ride.city_code}`, id.toString());
    return { success: true };
  }
  async deleteRide(id: bigint, audit: OperationActorContext) {
    const ride = await this.prisma.ride.findUnique({ where: { id } });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.rideParticipant.deleteMany({ where: { ride_id: id } });
      await tx.report.deleteMany({ where: { ride_id: id } });
      await tx.ride.delete({ where: { id } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'ride.delete',
        objectType: 'ride',
        objectId: id.toString(),
        reason: 'V1 管理接口删除',
        beforeSummary: { status: ride.status, audit_status: ride.audit_status },
        afterSummary: { deleted: true },
      });
    });
    await this.redis.geoRemove(`geo:rides:${ride.city_code}`, id.toString());
    return { success: true };
  }
  async activities(query: AdminContentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ActivityWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { user: { nickname: { contains: query.keyword } } },
            ],
          }
        : {}),
      ...(query.start_time || query.end_time
        ? {
            created_at: {
              ...(query.start_time ? { gte: new Date(query.start_time) } : {}),
              ...(query.end_time ? { lte: new Date(query.end_time) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: { user: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return {
      list: items.map((x) => ({
        id: x.id.toString(),
        title: x.title,
        cover_image: x.cover_image,
        status: x.status,
        start_time: x.start_time,
        register_count: x.register_count,
        created_at: x.created_at,
        creator: { id: x.user.id.toString(), nickname: x.user.nickname },
      })),
      pagination: { page, pageSize, total },
    };
  }
  async offlineActivity(id: bigint, audit: OperationActorContext) {
    const activity = await this.prisma.activity.findFirst({ where: { id, deleted_at: null } });
    if (!activity) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.activity.update({ where: { id }, data: { status: 5 } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'activity.offline',
        objectType: 'activity',
        objectId: id.toString(),
        reason: 'V1 管理接口下架',
        beforeSummary: { status: activity.status },
        afterSummary: { status: 5 },
      });
    });
    return { success: true };
  }
  async deleteActivity(id: bigint, audit: OperationActorContext) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.activityRegistration.deleteMany({ where: { activity_id: id } });
      await tx.report.deleteMany({ where: { activity_id: id } });
      await tx.activity.delete({ where: { id } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'activity.delete',
        objectType: 'activity',
        objectId: id.toString(),
        reason: 'V1 管理接口删除',
        beforeSummary: { status: activity.status },
        afterSummary: { deleted: true },
      });
    });
    return { success: true };
  }
  async users(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {
      deleted_at: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [{ nickname: { contains: query.keyword } }, { phone: { contains: query.keyword } }],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      list: items.map((x) => ({
        id: x.id.toString(),
        nickname: x.nickname,
        avatar_url: x.avatar_url,
        phone: x.phone,
        status: x.status,
        role: x.role,
        motorcycle_model: x.profile?.motorcycle_model ?? null,
        created_at: x.created_at,
      })),
      pagination: { page, pageSize, total },
    };
  }
  async userDetail(id: bigint) {
    const user = await this.prisma.user.findFirst({
      where: { id, deleted_at: null },
      include: { profile: true },
    });
    if (!user) throw new AppException(8001, '用户不存在', HttpStatus.NOT_FOUND);
    const [rideCount, activityCount] = await this.prisma.$transaction([
      this.prisma.ride.count({ where: { user_id: id, deleted_at: null } }),
      this.prisma.activity.count({ where: { user_id: id, deleted_at: null } }),
    ]);
    return {
      id: user.id.toString(),
      openid: user.openid,
      unionid: user.unionid,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      gender: user.gender,
      phone: user.phone,
      status: user.status,
      role: user.role,
      last_login_at: user.last_login_at,
      profile: user.profile,
      statistics: { ride_count: rideCount, activity_count: activityCount },
    };
  }
  async banUser(id: bigint, reason: string, audit: OperationActorContext) {
    const user = await this.prisma.user.findFirst({ where: { id, deleted_at: null } });
    if (!user) throw new AppException(8001, '用户不存在', HttpStatus.NOT_FOUND);
    if (user.status === 0) throw new AppException(8002, '用户已封禁');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 0 } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'user.ban',
        objectType: 'user',
        objectId: id.toString(),
        reason,
        beforeSummary: { status: user.status },
        afterSummary: { status: 0 },
      });
    });
    return { success: true };
  }
  async unbanUser(id: bigint, audit: OperationActorContext) {
    const user = await this.prisma.user.findFirst({ where: { id, deleted_at: null } });
    if (!user) throw new AppException(8001, '用户不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 1 } });
      await this.operationLogs.appendWithClient(tx, {
        ...audit,
        action: 'user.unban',
        objectType: 'user',
        objectId: id.toString(),
        reason: 'V1 管理接口解除封禁',
        beforeSummary: { status: user.status },
        afterSummary: { status: 1 },
      });
    });
    return { success: true };
  }
  async overview() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [total_users, dau, today_new_users, total_rides, total_activities] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { deleted_at: null } }),
        this.prisma.user.count({ where: { deleted_at: null, last_login_at: { gte: start } } }),
        this.prisma.user.count({ where: { deleted_at: null, created_at: { gte: start } } }),
        this.prisma.ride.count({ where: { deleted_at: null } }),
        this.prisma.activity.count({ where: { deleted_at: null } }),
      ]);
    return { total_users, dau, today_new_users, total_rides, total_activities };
  }
  async trend(days: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    const [users, rides, activities] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['created_at'],
        where: { created_at: { gte: start }, deleted_at: null },
        _count: { id: true },
      }),
      this.prisma.ride.groupBy({
        by: ['created_at'],
        where: { created_at: { gte: start }, deleted_at: null },
        _count: { id: true },
      }),
      this.prisma.activity.groupBy({
        by: ['created_at'],
        where: { created_at: { gte: start }, deleted_at: null },
        _count: { id: true },
      }),
    ]);
    const makeMap = (rows: Array<{ created_at: Date; _count: { id: number } }>) =>
      rows.reduce((map, row) => {
        const key = row.created_at.toISOString().slice(0, 10);
        map.set(key, (map.get(key) ?? 0) + row._count.id);
        return map;
      }, new Map<string, number>());
    const userMap = makeMap(users);
    const rideMap = makeMap(rides);
    const activityMap = makeMap(activities);
    return {
      list: Array.from({ length: days }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const key = date.toISOString().slice(0, 10);
        return {
          date: key,
          new_users: userMap.get(key) ?? 0,
          new_rides: rideMap.get(key) ?? 0,
          new_activities: activityMap.get(key) ?? 0,
        };
      }),
    };
  }
}
