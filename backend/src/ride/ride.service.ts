import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContentSecurityService } from '../common/content-security/content-security.service';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import {
  CreateRideDto,
  MyRideQueryDto,
  NearbyRideDto,
  ParticipantQueryDto,
  RideQueryDto,
  UpdateRideDto,
} from './dto';

const ACTIVE_STATUSES = [1, 2, 3];
const rideInclude = {
  user: { include: { profile: true } },
  participants: {
    where: { status: 1 },
    take: 8,
    orderBy: [{ is_creator: 'desc' }, { joined_at: 'asc' }],
    include: { user: true },
  },
} satisfies Prisma.RideInclude;
type RideRecord = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

@Injectable()
export class RideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly contentSecurity: ContentSecurityService,
  ) {}

  async list(query: RideQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RideWhereInput = {
      status: { in: ACTIVE_STATUSES },
      deleted_at: null,
      ...(query.city_code ? { city_code: query.city_code } : {}),
      ...(query.ride_style ? { ride_style: query.ride_style } : {}),
      ...(query.start_time || query.end_time
        ? {
            departure_time: {
              ...(query.start_time ? { gte: new Date(query.start_time) } : {}),
              ...(query.end_time ? { lte: new Date(query.end_time) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ride.findMany({
        where,
        include: rideInclude,
        orderBy: { departure_time: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ride.count({ where }),
    ]);
    const data = items.map((ride) => this.serializeRide(ride, query.latitude, query.longitude));
    const filtered =
      query.radius && query.latitude !== undefined && query.longitude !== undefined
        ? data.filter((ride) => ride.distance !== null && ride.distance <= query.radius!)
        : data;
    return { list: filtered, pagination: { page, pageSize, total } };
  }

  async nearby(query: NearbyRideDto) {
    const members = await this.redis.geoRadiusWithDistance(
      `geo:rides:${query.city_code}`,
      query.longitude,
      query.latitude,
      query.radius ?? 10,
    );
    if (!members.length) return { list: [] };
    const ids = members.map((item) => BigInt(item.member));
    const rides = await this.prisma.ride.findMany({
      where: { id: { in: ids }, status: { in: ACTIVE_STATUSES }, deleted_at: null },
      include: rideInclude,
    });
    const distances = new Map(members.map((item) => [item.member, item.distance]));
    return {
      list: rides
        .map((ride) =>
          this.serializeRide(
            ride,
            query.latitude,
            query.longitude,
            distances.get(ride.id.toString()) ?? null,
          ),
        )
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)),
    };
  }

  async detail(id: bigint) {
    const ride = await this.prisma.ride.findFirst({
      where: { id, deleted_at: null },
      include: rideInclude,
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    const viewCount = await this.redis.incr(`ride:view:${id.toString()}`);
    return {
      ...this.serializeRide(ride),
      view_count: ride.view_count + viewCount,
      description: ride.description,
      rules: ride.rules,
      audit_status: ride.audit_status,
      bike_requirement: ride.bike_requirement,
      min_people: ride.min_people,
      speed_level: ride.speed_level,
    };
  }

  async create(userId: bigint, dto: CreateRideDto) {
    if (dto.min_people > dto.max_people) throw new AppException(1001, '最少人数不能大于最多人数');
    if (new Date(dto.departure_time) <= new Date())
      throw new AppException(1001, '出发时间必须晚于当前时间');
    await this.contentSecurity.checkText(
      `${dto.title}\n${dto.description ?? ''}`,
      `ride-${userId.toString()}-${Date.now()}`,
    );
    // 嵌套创建由 Prisma 放在同一事务中执行，避免出现约骑已发布但发起人未报名的中间状态。
    const ride = await this.prisma.ride.create({
      data: {
        ...dto,
        rules: dto.rules as Prisma.InputJsonValue | undefined,
        user_id: userId,
        departure_time: new Date(dto.departure_time),
        meetup_lat: new Prisma.Decimal(dto.meetup_lat),
        meetup_lng: new Prisma.Decimal(dto.meetup_lng),
        status: 1,
        join_count: 1,
        participants: {
          create: { user_id: userId, status: 1, is_creator: true },
        },
      },
    });
    await this.redis.geoAdd(
      `geo:rides:${ride.city_code}`,
      Number(ride.meetup_lng),
      Number(ride.meetup_lat),
      ride.id.toString(),
    );
    const createdRide = await this.prisma.ride.findUniqueOrThrow({
      where: { id: ride.id },
      include: rideInclude,
    });
    return this.serializeRide(createdRide);
  }

  async update(userId: bigint, rideId: bigint, dto: UpdateRideDto) {
    const ride = await this.findEditableRide(userId, rideId);
    const minPeople = dto.min_people ?? ride.min_people;
    const maxPeople = dto.max_people ?? ride.max_people;
    if (minPeople > maxPeople) throw new AppException(1001, '最少人数不能大于最多人数');
    if (dto.departure_time && new Date(dto.departure_time) <= new Date()) {
      throw new AppException(1001, '出发时间必须晚于当前时间');
    }
    if (dto.title !== undefined || dto.description !== undefined) {
      await this.contentSecurity.checkText(
        `${dto.title ?? ride.title}\n${dto.description ?? ride.description ?? ''}`,
        `ride-${rideId.toString()}-${Date.now()}`,
      );
    }
    const locationChanged =
      dto.city_code !== undefined || dto.meetup_lat !== undefined || dto.meetup_lng !== undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.ride.update({
        where: { id: rideId },
        data: {
          ...dto,
          rules: dto.rules as Prisma.InputJsonValue | undefined,
          ...(dto.departure_time ? { departure_time: new Date(dto.departure_time) } : {}),
          ...(dto.meetup_lat !== undefined
            ? { meetup_lat: new Prisma.Decimal(dto.meetup_lat) }
            : {}),
          ...(dto.meetup_lng !== undefined
            ? { meetup_lng: new Prisma.Decimal(dto.meetup_lng) }
            : {}),
        },
      });
      if (locationChanged || dto.departure_time !== undefined || dto.meetup_address !== undefined) {
        const recipients = await tx.rideParticipant.findMany({
          where: { ride_id: rideId, status: 1 },
          select: { user_id: true },
        });
        if (recipients.length)
          await tx.notification.createMany({
            data: recipients.map((item) => ({
              user_id: item.user_id,
              type: 6,
              title: '约骑信息已更新',
              content: `“${record.title}”的时间或地点已更新`,
              related_type: 'ride',
              related_id: rideId,
              from_user_id: userId,
            })),
          });
      }
      return record;
    });
    if (locationChanged) {
      await this.redis.geoRemove(`geo:rides:${ride.city_code}`, rideId.toString());
      await this.redis.geoAdd(
        `geo:rides:${updated.city_code}`,
        Number(updated.meetup_lng),
        Number(updated.meetup_lat),
        rideId.toString(),
      );
    }
    const full = await this.prisma.ride.findUniqueOrThrow({
      where: { id: rideId },
      include: rideInclude,
    });
    return this.serializeRide(full);
  }

  async cancel(userId: bigint, rideId: bigint) {
    const ride = await this.findEditableRide(userId, rideId);
    await this.prisma.$transaction(async (tx) => {
      await tx.ride.update({ where: { id: rideId }, data: { status: 0 } });
      const recipients = await tx.rideParticipant.findMany({
        where: { ride_id: rideId, status: 1 },
        select: { user_id: true },
      });
      if (recipients.length)
        await tx.notification.createMany({
          data: recipients.map((item) => ({
            user_id: item.user_id,
            type: 2,
            title: '约骑已取消',
            content: `“${ride.title}”已被发起人取消`,
            related_type: 'ride',
            related_id: rideId,
            from_user_id: userId,
          })),
        });
    });
    await this.redis.geoRemove(`geo:rides:${ride.city_code}`, rideId.toString());
    return { success: true };
  }

  async join(userId: bigint, rideId: bigint) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const ride = await tx.ride.findFirst({ where: { id: rideId, deleted_at: null } });
        if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
        if (![1, 2].includes(ride.status)) throw new AppException(1001, '当前约骑不可报名');
        if (ride.join_count >= ride.max_people) throw new AppException(3002, '约骑人数已满');
        const participant = await tx.rideParticipant.findUnique({
          where: { ride_id_user_id: { ride_id: rideId, user_id: userId } },
        });
        if (participant?.status === 1) throw new AppException(3003, '您已报名该约骑');
        if (participant)
          await tx.rideParticipant.update({
            where: { id: participant.id },
            data: { status: 1, joined_at: new Date(), cancelled_at: null, deleted_at: null },
          });
        else
          await tx.rideParticipant.create({
            data: { ride_id: rideId, user_id: userId, status: 1, is_creator: false },
          });
        const updatedRide = await tx.ride.update({
          where: { id: rideId },
          data: { join_count: { increment: 1 } },
        });
        await tx.notification.create({
          data: {
            user_id: ride.user_id,
            type: 1,
            title: '新的约骑报名',
            content: `有骑友报名了“${ride.title}”`,
            related_type: 'ride',
            related_id: rideId,
            from_user_id: userId,
          },
        });
        return updatedRide;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      ride_id: rideId.toString(),
      join_count: result.join_count,
      is_full: result.join_count >= result.max_people,
    };
  }

  async leave(userId: bigint, rideId: bigint) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const ride = await tx.ride.findFirst({ where: { id: rideId, deleted_at: null } });
        if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
        const participant = await tx.rideParticipant.findUnique({
          where: { ride_id_user_id: { ride_id: rideId, user_id: userId } },
        });
        if (!participant || participant.status !== 1)
          return { idempotent: true, join_count: ride.join_count };
        if (participant.is_creator)
          throw new AppException(3005, '发起人不能取消自身报名，请直接取消约骑');
        if (ride.departure_time.getTime() - Date.now() <= 2 * 60 * 60 * 1000)
          throw new AppException(3004, '出发前2小时内不可取消报名');
        await tx.rideParticipant.update({
          where: { id: participant.id },
          data: { status: 2, cancelled_at: new Date() },
        });
        const updatedRide = await tx.ride.update({
          where: { id: rideId },
          data: { join_count: { decrement: 1 } },
        });
        await tx.notification.create({
          data: {
            user_id: ride.user_id,
            type: 1,
            title: '骑友取消报名',
            content: `有骑友取消了“${ride.title}”的报名`,
            related_type: 'ride',
            related_id: rideId,
            from_user_id: userId,
          },
        });
        return { idempotent: false, join_count: updatedRide.join_count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { ride_id: rideId.toString(), ...result };
  }

  async participants(rideId: bigint, query: ParticipantQueryDto) {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, deleted_at: null },
      select: { id: true },
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { ride_id: rideId, status: 1, deleted_at: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rideParticipant.findMany({
        where,
        orderBy: [{ is_creator: 'desc' }, { joined_at: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { include: { profile: true } } },
      }),
      this.prisma.rideParticipant.count({ where }),
    ]);
    return {
      list: items.map((item) => ({
        user_id: item.user_id.toString(),
        nickname: item.user.nickname,
        avatar_url: item.user.avatar_url,
        motorcycle_model: item.user.profile?.motorcycle_model ?? null,
        joined_at: item.joined_at,
        is_creator: item.is_creator,
      })),
      pagination: { page, pageSize, total },
    };
  }

  async removeParticipant(creatorId: bigint, rideId: bigint, userId: bigint) {
    const ride = await this.findEditableRide(creatorId, rideId);
    if (creatorId === userId) throw new AppException(1001, '不能移除发起人');
    await this.prisma.$transaction(
      async (tx) => {
        const participant = await tx.rideParticipant.findUnique({
          where: { ride_id_user_id: { ride_id: rideId, user_id: userId } },
        });
        if (!participant || participant.status !== 1) throw new AppException(1001, '该用户未报名');
        await tx.rideParticipant.update({ where: { id: participant.id }, data: { status: 3 } });
        await tx.ride.update({ where: { id: rideId }, data: { join_count: { decrement: 1 } } });
        await tx.notification.create({
          data: {
            user_id: userId,
            type: 1,
            title: '已被移出约骑',
            content: `您已被移出“${ride.title}”`,
            related_type: 'ride',
            related_id: rideId,
            from_user_id: creatorId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { success: true };
  }

  async mine(userId: bigint, query: MyRideQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RideWhereInput =
      query.type === 'created'
        ? { user_id: userId, deleted_at: null }
        : {
            participants: { some: { user_id: userId, status: 1, deleted_at: null } },
            deleted_at: null,
          };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ride.findMany({
        where,
        include: rideInclude,
        orderBy: { departure_time: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ride.count({ where }),
    ]);
    return {
      list: items.map((ride) => this.serializeRide(ride)),
      pagination: { page, pageSize, total },
    };
  }

  private async findEditableRide(userId: bigint, rideId: bigint) {
    const ride = await this.prisma.ride.findFirst({ where: { id: rideId, deleted_at: null } });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    if (ride.user_id !== userId) throw new AppException(3005, '无权限操作', HttpStatus.FORBIDDEN);
    if (![1, 2].includes(ride.status)) throw new AppException(1001, '已出发或已结束的约骑不可操作');
    return ride;
  }

  private serializeRide(
    ride: RideRecord,
    latitude?: number,
    longitude?: number,
    presetDistance: number | null = null,
  ) {
    const distance =
      presetDistance ??
      (latitude !== undefined && longitude !== undefined
        ? this.distance(latitude, longitude, Number(ride.meetup_lat), Number(ride.meetup_lng))
        : null);
    return {
      id: ride.id.toString(),
      title: ride.title,
      ride_style: ride.ride_style,
      departure_time: ride.departure_time,
      meetup_address: ride.meetup_address,
      meetup_lat: ride.meetup_lat.toString(),
      meetup_lng: ride.meetup_lng.toString(),
      destination: ride.destination,
      max_people: ride.max_people,
      join_count: ride.join_count,
      is_full: ride.join_count >= ride.max_people,
      status: ride.status,
      city_code: ride.city_code,
      view_count: ride.view_count,
      created_at: ride.created_at,
      distance,
      creator: {
        id: ride.user.id.toString(),
        nickname: ride.user.nickname,
        avatar_url: ride.user.avatar_url,
        motorcycle_model: ride.user.profile?.motorcycle_model ?? null,
        riding_years: ride.user.profile?.riding_years ?? null,
      },
      participant_avatars: ride.participants
        .map((participant) => participant.user.avatar_url)
        .filter((url): url is string => Boolean(url)),
    };
  }

  private distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const a =
      Math.sin(radians(lat2 - lat1) / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
    return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  }
}
