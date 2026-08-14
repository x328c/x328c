import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { SafetyAgreementService } from '../safety/safety-agreement.service';
import {
  ActivityActionDto,
  ActivityQueryDto,
  ApproveRegistrationDto,
  CreateActivityDto,
  MineActivityDto,
  RegisterActivityDto,
  UpdateActivityDto,
} from './dto';

const include = {
  user: { include: { profile: true } },
  registrations: {
    where: { status: { in: [1, 2] } },
    orderBy: { registered_at: 'asc' },
    take: 8,
    include: { user: true },
  },
  route_links: {
    take: 1,
    include: {
      route: {
        select: {
          id: true,
          title: true,
          city_code: true,
          city_name: true,
          difficulty: true,
          distance_km: true,
          status: true,
          deleted_at: true,
          points: { orderBy: { order: 'asc' as const }, select: { name: true, type: true } },
        },
      },
    },
  },
} satisfies Prisma.ActivityInclude;
type ActivityRecord = Prisma.ActivityGetPayload<{ include: typeof include }>;

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly safetyAgreements: SafetyAgreementService,
  ) {}

  async list(query: ActivityQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ActivityWhereInput = {
      status: { in: [1, 2, 3] },
      deleted_at: null,
      ...(query.activity_type ? { activity_type: query.activity_type } : {}),
      ...(query.fee_type ? { fee_type: query.fee_type } : {}),
      ...(query.city_code ? { city_code: query.city_code } : {}),
      ...(query.start_time || query.end_time
        ? {
            start_time: {
              ...(query.start_time ? { gte: new Date(query.start_time) } : {}),
              ...(query.end_time ? { lte: new Date(query.end_time) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include,
        orderBy: { start_time: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { list: items.map((item) => this.summary(item)), pagination: { page, pageSize, total } };
  }

  async detail(viewerId: bigint, id: bigint) {
    const item = await this.findActivity(id);
    const registration = await this.prisma.activityRegistration.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: viewerId } },
      select: { status: true },
    });
    return {
      ...this.summary(item),
      route_description: item.route_description,
      requirements: item.requirements,
      content: item.content,
      contact_name: item.contact_name,
      contact_wechat: item.contact_wechat,
      need_approval: item.need_approval,
      fee_amount: item.fee_amount?.toString() ?? null,
      registration_status: registration?.status ?? null,
    };
  }

  async create(
    userId: bigint,
    dto: CreateActivityDto,
    requestId = 'unknown',
    idempotencyKey?: string,
  ) {
    if (
      new Date(dto.end_time) <= new Date(dto.start_time) ||
      new Date(dto.start_time) <= new Date()
    )
      throw new AppException(1001, '活动时间不合法');
    if (dto.fee_type === 3 && dto.fee_amount === undefined)
      throw new AppException(1001, '固定费用必须填写金额');
    const { route_id, route_link_source, agreement, ...payload } = dto;
    const item = await this.prisma.$transaction(async (tx) => {
      const route = route_id
        ? await this.validateRouteLink(tx, BigInt(route_id), dto.city_code)
        : null;
      const created = await tx.activity.create({
        data: {
          ...payload,
          user_id: userId,
          start_time: new Date(dto.start_time),
          end_time: new Date(dto.end_time),
          meetup_lat: new Prisma.Decimal(dto.meetup_lat),
          meetup_lng: new Prisma.Decimal(dto.meetup_lng),
          fee_amount: dto.fee_amount === undefined ? undefined : new Prisma.Decimal(dto.fee_amount),
          status: 1,
          ...(route
            ? {
                route_links: {
                  create: { route_id: route.id, source: route_link_source ?? 'create_form' },
                },
              }
            : {}),
        },
        include,
      });
      await this.safetyAgreements.verifyAndRecord(tx, {
        userId,
        scene: 'activity_create',
        targetType: 'activity',
        targetId: created.id,
        proof: agreement,
        requestId,
        idempotencyKey,
      });
      return created;
    });
    return this.summary(item);
  }

  async update(userId: bigint, id: bigint, dto: UpdateActivityDto) {
    await this.findOwnedEditable(userId, id);
    if (dto.start_time && new Date(dto.start_time) <= new Date())
      throw new AppException(1001, '活动已开始或开始时间不合法');
    const item = await this.prisma.activity.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.start_time ? { start_time: new Date(dto.start_time) } : {}),
        ...(dto.end_time ? { end_time: new Date(dto.end_time) } : {}),
        ...(dto.meetup_lat !== undefined ? { meetup_lat: new Prisma.Decimal(dto.meetup_lat) } : {}),
        ...(dto.meetup_lng !== undefined ? { meetup_lng: new Prisma.Decimal(dto.meetup_lng) } : {}),
        ...(dto.fee_amount !== undefined ? { fee_amount: new Prisma.Decimal(dto.fee_amount) } : {}),
      },
      include,
    });
    return this.summary(item);
  }

  async cancel(userId: bigint, id: bigint) {
    const current = await this.findOwnedEditable(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.activity.update({ where: { id }, data: { status: 4 } });
      const users = await tx.activityRegistration.findMany({
        where: { activity_id: id, status: { in: [1, 2] } },
        select: { user_id: true },
      });
      if (users.length)
        await tx.notification.createMany({
          data: users.map((x) => ({
            user_id: x.user_id,
            type: 5,
            title: '活动已取消',
            content: `“${current.title}”已取消`,
            related_type: 'activity',
            related_id: id,
            from_user_id: userId,
          })),
        });
    });
    return { success: true };
  }

  async register(
    userId: bigint,
    id: bigint,
    dto: RegisterActivityDto,
    requestId = 'unknown',
    idempotencyKey?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const activity = await tx.activity.findFirst({ where: { id, deleted_at: null } });
        if (!activity) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
        if (activity.status !== 1) throw new AppException(4002, '报名已截止');
        const old = await tx.activityRegistration.findUnique({
          where: { activity_id_user_id: { activity_id: id, user_id: userId } },
        });
        if (old?.status === 1 || old?.status === 2) throw new AppException(4003, '已报名');
        const activeCount = await tx.activityRegistration.count({
          where: { activity_id: id, status: { in: [1, 2] } },
        });
        if (activity.max_people > 0 && activeCount >= activity.max_people)
          throw new AppException(4002, '活动报名已满');
        const status = activity.need_approval ? 1 : 2;
        const { agreement, ...registrationPayload } = dto;
        const registration = old
          ? await tx.activityRegistration.update({
              where: { id: old.id },
              data: {
                ...registrationPayload,
                status,
                reject_reason: null,
                registered_at: new Date(),
                audited_at: activity.need_approval ? null : new Date(),
                deleted_at: null,
              },
            })
          : await tx.activityRegistration.create({
              data: {
                ...registrationPayload,
                activity_id: id,
                user_id: userId,
                status,
                audited_at: activity.need_approval ? null : new Date(),
              },
            });
        if (status === 2)
          await tx.activity.update({ where: { id }, data: { register_count: { increment: 1 } } });
        await tx.notification.create({
          data: {
            user_id: activity.user_id,
            type: 4,
            title: '新的活动报名',
            content: '有用户报名了您的活动',
            related_type: 'activity',
            related_id: id,
            from_user_id: userId,
          },
        });
        await this.safetyAgreements.verifyAndRecord(tx, {
          userId,
          scene: 'activity_register',
          targetType: 'activity',
          targetId: id,
          proof: agreement,
          requestId,
          idempotencyKey,
        });
        return { registration_id: registration.id.toString(), status };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async approve(ownerId: bigint, id: bigint, dto: ApproveRegistrationDto) {
    const activity = await this.findOwnedEditable(ownerId, id);
    const targetUserId = BigInt(dto.user_id);
    const registration = await this.prisma.activityRegistration.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: targetUserId } },
    });
    if (!registration) throw new AppException(4001, '报名记录不存在', HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.activityRegistration.findUniqueOrThrow({
        where: { id: registration.id },
      });
      if (current.status !== 1) throw new AppException(1001, '报名记录已处理');
      if (dto.action === 'approve') {
        const count = await tx.activityRegistration.count({
          where: { activity_id: id, status: 2 },
        });
        if (activity.max_people > 0 && count >= activity.max_people)
          throw new AppException(4002, '活动报名已满');
        await tx.activityRegistration.update({
          where: { id: current.id },
          data: { status: 2, audited_at: new Date() },
        });
        await tx.activity.update({ where: { id }, data: { register_count: { increment: 1 } } });
      } else
        await tx.activityRegistration.update({
          where: { id: current.id },
          data: { status: 3, reject_reason: dto.reject_reason, audited_at: new Date() },
        });
      await tx.notification.create({
        data: {
          user_id: registration.user_id,
          type: 4,
          title: dto.action === 'approve' ? '活动报名已通过' : '活动报名未通过',
          content:
            dto.action === 'approve'
              ? `您已通过“${activity.title}”报名审核`
              : `您的报名未通过：${dto.reject_reason ?? '暂不符合活动要求'}`,
          related_type: 'activity',
          related_id: id,
          from_user_id: ownerId,
        },
      });
      return { success: true, status: dto.action === 'approve' ? 2 : 3 };
    });
  }

  async leave(userId: bigint, id: bigint) {
    const activity = await this.findActivity(id);
    const registration = await this.prisma.activityRegistration.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: userId } },
    });
    if (!registration || ![1, 2].includes(registration.status))
      return { success: true, idempotent: true };
    if (activity.start_time.getTime() - Date.now() < 24 * 60 * 60 * 1000)
      throw new AppException(4002, '活动开始前24小时内不可取消报名');
    await this.prisma.$transaction(async (tx) => {
      await tx.activityRegistration.update({ where: { id: registration.id }, data: { status: 4 } });
      if (registration.status === 2)
        await tx.activity.update({ where: { id }, data: { register_count: { decrement: 1 } } });
      await tx.notification.create({
        data: {
          user_id: activity.user_id,
          type: 4,
          title: '用户取消活动报名',
          content: `有用户取消了“${activity.title}”的报名`,
          related_type: 'activity',
          related_id: id,
          from_user_id: userId,
        },
      });
    });
    return { success: true, idempotent: false };
  }

  async registrations(viewerId: bigint, id: bigint) {
    const activity = await this.findActivity(id);
    if (activity.user_id !== viewerId)
      throw new AppException(4004, '无权限查看报名列表', HttpStatus.FORBIDDEN);
    const items = await this.prisma.activityRegistration.findMany({
      where: { activity_id: id, deleted_at: null },
      orderBy: { registered_at: 'asc' },
      include: { user: { include: { profile: true } } },
    });
    return items.map((x) => ({
      id: x.id.toString(),
      user_id: x.user_id.toString(),
      nickname: x.user.nickname,
      avatar_url: x.user.avatar_url,
      motorcycle_model: x.user.profile?.motorcycle_model ?? null,
      status: x.status,
      real_name: x.real_name,
      phone: x.phone,
      reject_reason: x.reject_reason,
      registered_at: x.registered_at,
    }));
  }

  async removeRegistration(ownerId: bigint, id: bigint, userId: bigint) {
    const activity = await this.findOwnedEditable(ownerId, id);
    const registration = await this.prisma.activityRegistration.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: userId } },
    });
    if (!registration || ![1, 2].includes(registration.status))
      throw new AppException(1001, '该用户未报名');
    await this.prisma.$transaction(async (tx) => {
      await tx.activityRegistration.update({ where: { id: registration.id }, data: { status: 4 } });
      if (registration.status === 2)
        await tx.activity.update({ where: { id }, data: { register_count: { decrement: 1 } } });
      await tx.notification.create({
        data: {
          user_id: userId,
          type: 4,
          title: '已被移出活动',
          content: `您已被移出“${activity.title}”`,
          related_type: 'activity',
          related_id: id,
          from_user_id: ownerId,
        },
      });
    });
    return { success: true };
  }

  async notify(ownerId: bigint, id: bigint, dto: ActivityActionDto) {
    const activity = await this.findOwnedEditable(ownerId, id);
    const users = await this.prisma.activityRegistration.findMany({
      where: { activity_id: id, status: 2 },
      select: { user_id: true },
    });
    if (users.length)
      await this.prisma.notification.createMany({
        data: users.map((x) => ({
          user_id: x.user_id,
          type: 6,
          title: activity.title,
          content: dto.content,
          related_type: 'activity',
          related_id: id,
          from_user_id: ownerId,
        })),
      });
    return { success: true, notified: users.length };
  }

  async mine(userId: bigint, query: MineActivityDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ActivityWhereInput =
      query.type === 'created'
        ? { user_id: userId, deleted_at: null }
        : {
            registrations: { some: { user_id: userId, status: { in: [1, 2] }, deleted_at: null } },
            deleted_at: null,
          };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include,
        orderBy: { start_time: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { list: items.map((x) => this.summary(x)), pagination: { page, pageSize, total } };
  }

  private async findActivity(id: bigint): Promise<ActivityRecord> {
    const item = await this.prisma.activity.findFirst({ where: { id, deleted_at: null }, include });
    if (!item) throw new AppException(4001, '活动不存在', HttpStatus.NOT_FOUND);
    return item;
  }
  private async findOwnedEditable(ownerId: bigint, id: bigint) {
    const item = await this.findActivity(id);
    if (item.user_id !== ownerId) throw new AppException(4004, '无权限操作', HttpStatus.FORBIDDEN);
    if (item.status !== 1 || item.start_time <= new Date())
      throw new AppException(1001, '活动已开始或不可操作');
    return item;
  }
  private summary(item: ActivityRecord) {
    return {
      id: item.id.toString(),
      title: item.title,
      cover_image: item.cover_image,
      activity_type: item.activity_type,
      start_time: item.start_time,
      end_time: item.end_time,
      meetup_address: item.meetup_address,
      max_people: item.max_people,
      register_count: item.register_count,
      is_full: item.max_people > 0 && item.register_count >= item.max_people,
      fee_type: item.fee_type,
      fee_amount: item.fee_amount?.toString() ?? null,
      status: item.status,
      city_code: item.city_code,
      creator: {
        id: item.user.id.toString(),
        nickname: item.user.nickname,
        avatar_url: item.user.avatar_url,
        motorcycle_model: item.user.profile?.motorcycle_model ?? null,
      },
      registration_avatars: item.registrations
        .map((x) => x.user.avatar_url)
        .filter((x): x is string => Boolean(x)),
      route: this.serializeRouteLink(item.route_links[0]?.route),
    };
  }

  private async validateRouteLink(tx: Prisma.TransactionClient, routeId: bigint, cityCode: string) {
    await this.flags.assertEnabled('route.link_enabled');
    const route = await tx.route.findFirst({
      where: { id: routeId, status: 1, deleted_at: null },
      select: { id: true, city_code: true },
    });
    if (!route) throw new AppException(53001, '所选路线已下架或不可关联', HttpStatus.CONFLICT);
    if (route.city_code && route.city_code !== cityCode)
      throw new AppException(53002, '路线城市与活动城市不一致，请重新确认', HttpStatus.CONFLICT);
    return route;
  }

  private serializeRouteLink(route: ActivityRecord['route_links'][number]['route'] | undefined) {
    if (!route) return null;
    const start = route.points.find((point) => point.type === 'start') ?? route.points[0];
    const end = route.points.find((point) => point.type === 'end') ?? route.points.at(-1);
    return {
      id: route.id.toString(),
      title: route.title,
      city_code: route.city_code,
      city_name: route.city_name,
      difficulty: route.difficulty,
      distance_km: route.distance_km?.toString() ?? null,
      start_name: start?.name ?? null,
      end_name: end?.name ?? null,
      available: route.status === 1 && route.deleted_at === null,
    };
  }
}
