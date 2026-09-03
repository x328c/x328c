import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { FeatureFlagService } from '../common/feature-flag/feature-flag.service';
import { SafetyAgreementService } from '../safety/safety-agreement.service';
import { OptionalAgreementDto } from '../safety/dto/agreement.dto';
import { UserService } from '../user/user.service';
import { RegionService } from '../region/region.service';
import { rideDistanceQueries } from './ride-distance-query';
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
  points: { orderBy: { order: 'asc' as const } },
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
          polyline: true,
          external_route_url: true,
          points: {
            orderBy: { order: 'asc' as const },
            select: {
              name: true,
              address: true,
              latitude: true,
              longitude: true,
              type: true,
              province_code: true,
              city_code: true,
              district_code: true,
            },
          },
        },
      },
      user_route: {
        select: {
          id: true,
          user_id: true,
          title: true,
          start_location: true,
          end_location: true,
          difficulty: true,
          total_distance: true,
          visibility: true,
          status: true,
          city_code: true,
          district_code: true,
          start_lat: true,
          start_lng: true,
          end_lat: true,
          end_lng: true,
          waypoints: true,
          polyline: true,
          external_route_url: true,
        },
      },
    },
  },
} satisfies Prisma.RideInclude;
type RideRecord = Prisma.RideGetPayload<{ include: typeof rideInclude }>;

interface RidePointInput {
  type: 'waypoint' | 'destination';
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  province_code?: string | null;
  city_code?: string | null;
  district_code?: string | null;
  source: string;
}

interface RideRoutePlan {
  type: 'official' | 'user';
  id: bigint;
  title: string;
  start: {
    name: string;
    latitude: number;
    longitude: number;
    province_code?: string | null;
    city_code?: string | null;
    district_code?: string | null;
  };
  points: RidePointInput[];
  polyline: Array<{ latitude: number; longitude: number }>;
  external_route_url: string | null;
  snapshot: Prisma.InputJsonObject;
}

@Injectable()
export class RideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly flags: FeatureFlagService,
    private readonly safetyAgreements: SafetyAgreementService,
    private readonly users: UserService,
    @Optional() private readonly regions?: RegionService,
  ) {}

  async list(query: RideQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.RideWhereInput = {
      status: { in: ACTIVE_STATUSES },
      deleted_at: null,
      ...this.rideRegionWhere(query),
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
    const hasLocation = query.latitude !== undefined && query.longitude !== undefined;
    if (query.radius !== undefined && !hasLocation) {
      throw new AppException(1001, '距离筛选需要提供当前位置');
    }
    if (hasLocation || query.city_code) {
      const queries = rideDistanceQueries(query);
      return this.prisma.$transaction(
        async (tx) => {
          const counts = await tx.$queryRaw<Array<{ total: bigint }>>(queries.count);
          const ranked = await tx.$queryRaw<Array<{ id: bigint; distance_km: number | null }>>(
            queries.page,
          );
          const items = ranked.length
            ? await tx.ride.findMany({
                where: { id: { in: ranked.map((row) => row.id) } },
                include: rideInclude,
                take: pageSize,
              })
            : [];
          const byId = new Map(items.map((ride) => [ride.id.toString(), ride]));
          return {
            list: ranked.flatMap((row) => {
              const ride = byId.get(row.id.toString());
              return ride
                ? [
                    {
                      ...this.serializeRide(
                        ride,
                        undefined,
                        undefined,
                        row.distance_km === null ? null : Number(row.distance_km),
                      ),
                      region_match: this.rideRegionMatch(ride, query),
                    },
                  ]
                : [];
            }),
            pagination: { page, pageSize, total: Number(counts[0]?.total ?? 0) },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ride.findMany({
        where,
        include: rideInclude,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ride.count({ where }),
    ]);
    const serialized = items
      .map((ride) => ({
        record: ride,
        value: {
          ...this.serializeRide(ride),
          region_match: this.rideRegionMatch(ride, query),
        },
      }))
      .sort(
        (left, right) =>
          this.regionRank(left.value.region_match) - this.regionRank(right.value.region_match) ||
          right.record.created_at.getTime() - left.record.created_at.getTime() ||
          (right.record.id > left.record.id ? 1 : right.record.id < left.record.id ? -1 : 0),
      );
    return {
      list: serialized.map(({ value }) => value),
      pagination: { page, pageSize, total },
    };
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

  async detail(id: bigint, viewerId?: bigint) {
    const ride = await this.prisma.ride.findFirst({
      where: { id, deleted_at: null },
      include: rideInclude,
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    const viewCount = await this.redis.incr(`ride:view:${id.toString()}`);
    const serialized = this.serializeRide(ride, undefined, undefined, null, viewerId);
    return {
      ...serialized,
      creator: {
        ...serialized.creator,
        wechat_id: await this.users.getVisibleWechat(viewerId, ride.user_id),
      },
      view_count: ride.view_count + viewCount,
      description: ride.description,
      rules: ride.rules,
      audit_status: ride.audit_status,
      bike_requirement: ride.bike_requirement,
      min_people: ride.min_people,
      speed_level: ride.speed_level,
    };
  }

  async create(userId: bigint, dto: CreateRideDto, requestId = 'unknown', idempotencyKey?: string) {
    await this.users.assertProfileComplete(userId);
    if (dto.min_people > dto.max_people) throw new AppException(1001, '最少人数不能大于最多人数');
    if (new Date(dto.departure_time) <= new Date())
      throw new AppException(1001, '出发时间必须晚于当前时间');
    const {
      route_id,
      user_route_id,
      route_link_source,
      route_customized,
      agreement,
      waypoints,
      destination_point,
      district_code,
      ...payload
    } = dto;
    if (route_customized || (!route_id && !user_route_id)) {
      this.regions?.assertPoint(
        {
          latitude: dto.meetup_lat,
          longitude: dto.meetup_lng,
          city_code: dto.city_code,
          district_code,
        },
        '集合地点',
      );
      for (const [index, point] of (waypoints ?? []).entries())
        this.regions?.assertPoint(point, `途经点 ${index + 1}`);
      if (destination_point) this.regions?.assertPoint(destination_point, '终点');
    }
    if (route_id && user_route_id) throw new AppException(1001, '只能关联一条路线');
    const ride = await this.prisma.$transaction(async (tx) => {
      const route = route_id
        ? await this.validateRouteLink(tx, BigInt(route_id))
        : user_route_id
          ? await this.validateUserRouteLink(tx, BigInt(user_route_id), userId)
          : null;
      const meetup = (!route_customized ? route?.start : undefined) ?? {
        name: dto.meetup_address,
        latitude: dto.meetup_lat,
        longitude: dto.meetup_lng,
        province_code: '650000',
        city_code: dto.city_code,
        district_code,
      };
      this.regions?.assertPoint(meetup, '集合地点');
      const ridePoints =
        (!route_customized ? route?.points : undefined) ??
        this.manualRidePoints(waypoints, destination_point);
      for (const [index, point] of ridePoints.entries())
        this.regions?.assertPoint(point, `路线点位 ${index + 1}`);
      const destinationPoint = [...ridePoints]
        .reverse()
        .find((point) => point.type === 'destination');
      const created = await tx.ride.create({
        data: {
          ...payload,
          city_code: meetup.city_code!,
          meetup_address: meetup.name,
          destination: destinationPoint?.name ?? payload.destination,
          district_code: meetup.district_code ?? null,
          destination_lat: destinationPoint
            ? new Prisma.Decimal(destinationPoint.latitude)
            : undefined,
          destination_lng: destinationPoint
            ? new Prisma.Decimal(destinationPoint.longitude)
            : undefined,
          destination_city_code: destinationPoint?.city_code ?? null,
          destination_district_code: destinationPoint?.district_code ?? null,
          route_snapshot: route
            ? {
                ...route.snapshot,
                customized: Boolean(route_customized),
                start: meetup as unknown as Prisma.InputJsonObject,
                points: ridePoints as unknown as Prisma.InputJsonArray,
                ...(route_customized ? { polyline: [], external_route_url: null } : {}),
              }
            : undefined,
          route_snapshot_version: route ? 1 : null,
          rules: dto.rules as Prisma.InputJsonValue | undefined,
          user_id: userId,
          departure_time: new Date(dto.departure_time),
          meetup_lat: new Prisma.Decimal(meetup.latitude),
          meetup_lng: new Prisma.Decimal(meetup.longitude),
          status: 1,
          join_count: 1,
          participants: { create: { user_id: userId, status: 1, is_creator: true } },
          ...(ridePoints.length
            ? {
                points: {
                  create: ridePoints.map((point, order) => ({
                    order,
                    type: point.type,
                    name: point.name,
                    address: point.address,
                    latitude: new Prisma.Decimal(point.latitude),
                    longitude: new Prisma.Decimal(point.longitude),
                    province_code: point.province_code ?? '650000',
                    city_code: point.city_code,
                    district_code: point.district_code,
                    source: point.source,
                  })),
                },
              }
            : {}),
          ...(route
            ? {
                route_links: {
                  create: {
                    ...(route.type === 'official'
                      ? { route_id: route.id }
                      : { user_route_id: route.id }),
                    source: route_link_source ?? 'create_form',
                  },
                },
              }
            : {}),
        },
      });
      await this.safetyAgreements.verifyAndRecord(tx, {
        userId,
        scene: 'ride_create',
        targetType: 'ride',
        targetId: created.id,
        proof: agreement,
        requestId,
        idempotencyKey,
      });
      return created;
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
    const locationChanged =
      dto.city_code !== undefined ||
      dto.district_code !== undefined ||
      dto.meetup_lat !== undefined ||
      dto.meetup_lng !== undefined;
    const nextDistrict =
      dto.district_code ??
      (dto.city_code !== undefined && dto.city_code !== ride.city_code
        ? undefined
        : (ride.district_code ?? undefined));
    if (locationChanged)
      this.regions?.assertPoint(
        {
          latitude: dto.meetup_lat ?? Number(ride.meetup_lat),
          longitude: dto.meetup_lng ?? Number(ride.meetup_lng),
          city_code: dto.city_code ?? ride.city_code,
          district_code: nextDistrict,
        },
        '集合地点',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.ride.update({
        where: { id: rideId },
        data: {
          ...dto,
          ...(locationChanged ? { district_code: nextDistrict || null } : {}),
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

  async finish(userId: bigint, rideId: bigint) {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, deleted_at: null },
      select: { id: true, user_id: true, status: true, city_code: true },
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    if (ride.user_id !== userId)
      throw new AppException(3005, '只有发起人可以结束同行', HttpStatus.FORBIDDEN);
    if (ride.status !== 3) throw new AppException(1001, '只有进行中的同行可以结束');

    const updated = await this.prisma.ride.updateMany({
      where: { id: rideId, user_id: userId, status: 3, deleted_at: null },
      data: { status: 4 },
    });
    if (!updated.count) throw new AppException(1001, '同行状态已发生变化，请刷新后重试');
    await this.redis.geoRemove(`geo:rides:${ride.city_code}`, rideId.toString());
    return { success: true };
  }

  async transferCreator(userId: bigint, rideId: bigint, targetUserId: bigint) {
    if (userId === targetUserId) throw new AppException(1001, '不能转让给自己');
    const result = await this.prisma.$transaction(
      async (tx) => {
        const ride = await tx.ride.findFirst({ where: { id: rideId, deleted_at: null } });
        if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
        if (ride.user_id !== userId)
          throw new AppException(3005, '只有当前发起人可以转让', HttpStatus.FORBIDDEN);
        if (![1, 2].includes(ride.status) || ride.departure_time <= new Date())
          throw new AppException(1001, '同行开始后不可转让发起人');
        const target = await tx.rideParticipant.findUnique({
          where: { ride_id_user_id: { ride_id: rideId, user_id: targetUserId } },
          include: { user: { select: { nickname: true } } },
        });
        if (!target || target.status !== 1 || target.deleted_at)
          throw new AppException(1001, '只能转让给已报名的成员');

        await tx.rideParticipant.updateMany({
          where: { ride_id: rideId, is_creator: true },
          data: { is_creator: false },
        });
        await tx.rideParticipant.update({
          where: { id: target.id },
          data: { is_creator: true },
        });
        await tx.ride.update({ where: { id: rideId }, data: { user_id: targetUserId } });
        await tx.notification.createMany({
          data: [
            {
              user_id: targetUserId,
              type: 6,
              title: '您已成为同行发起人',
              content: `“${ride.title}”已转让给您，请及时确认同行安排`,
              related_type: 'ride',
              related_id: rideId,
              from_user_id: userId,
            },
            {
              user_id: userId,
              type: 6,
              title: '同行转让成功',
              content: `“${ride.title}”已转让给${target.user.nickname}`,
              related_type: 'ride',
              related_id: rideId,
              from_user_id: targetUserId,
            },
          ],
        });
        return { target: target.user.nickname };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { success: true, creator_id: targetUserId.toString(), creator_name: result.target };
  }

  async join(
    userId: bigint,
    rideId: bigint,
    dto: OptionalAgreementDto = {},
    requestId = 'unknown',
    idempotencyKey?: string,
  ) {
    await this.users.assertProfileComplete(userId);
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
        await this.safetyAgreements.verifyAndRecord(tx, {
          userId,
          scene: 'ride_join',
          targetType: 'ride',
          targetId: rideId,
          proof: dto.agreement,
          requestId,
          idempotencyKey,
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
            participants: { some: { user_id: userId, status: { in: [1, 2] }, deleted_at: null } },
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

  async share(rideId: bigint) {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, deleted_at: null },
      select: {
        id: true,
        title: true,
        departure_time: true,
        meetup_address: true,
        destination: true,
        join_count: true,
        max_people: true,
        status: true,
      },
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    const time = ride.departure_time.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return {
      title: `${ride.title}｜${time}｜${ride.join_count}/${ride.max_people}人`,
      path: `/pages/rides/detail/index?id=${ride.id.toString()}`,
      imageUrl: process.env.RIDE_SHARE_IMAGE_URL ?? '',
      summary: {
        departure_time: ride.departure_time.toISOString(),
        meetup_address: ride.meetup_address,
        destination: ride.destination,
        join_count: ride.join_count,
        max_people: ride.max_people,
        status: ride.status,
      },
    };
  }

  async relaunchTemplate(userId: bigint, rideId: bigint) {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, deleted_at: null },
      include: {
        points: { orderBy: { order: 'asc' } },
        route_links: { take: 1 },
        participants: {
          where: { user_id: userId, status: { in: [1, 2] }, deleted_at: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    if (ride.user_id !== userId && !ride.participants.length) {
      throw new AppException(52122, '仅原发起人或历史参与者可再次发起', HttpStatus.FORBIDDEN);
    }
    if ([1, 2].includes(ride.status) && ride.departure_time > new Date()) {
      throw new AppException(52123, '同行尚未结束，不能生成再次发起模板');
    }
    const link = ride.route_links[0];
    return {
      source_ride_id: ride.id.toString(),
      title: ride.title,
      ride_style: ride.ride_style,
      departure_time: null,
      meetup_address: ride.meetup_address,
      meetup_lat: Number(ride.meetup_lat),
      meetup_lng: Number(ride.meetup_lng),
      destination: ride.destination,
      destination_point:
        ride.destination_lat && ride.destination_lng
          ? {
              name: ride.destination ?? '终点',
              latitude: Number(ride.destination_lat),
              longitude: Number(ride.destination_lng),
              city_code: ride.destination_city_code,
              district_code: ride.destination_district_code,
            }
          : null,
      waypoints: ride.points
        .filter((point) => point.type === 'waypoint')
        .map((point) => ({
          name: point.name,
          address: point.address,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          province_code: point.province_code,
          city_code: point.city_code,
          district_code: point.district_code,
        })),
      min_people: ride.min_people,
      max_people: ride.max_people,
      speed_level: ride.speed_level,
      bike_requirement: ride.bike_requirement,
      description: ride.description,
      rules: ride.rules,
      city_code: ride.city_code,
      district_code: ride.district_code,
      route_id: link?.route_id?.toString() ?? null,
      user_route_id: link?.user_route_id?.toString() ?? null,
    };
  }

  private async findEditableRide(userId: bigint, rideId: bigint) {
    const ride = await this.prisma.ride.findFirst({ where: { id: rideId, deleted_at: null } });
    if (!ride) throw new AppException(3001, '约骑不存在', HttpStatus.NOT_FOUND);
    if (ride.user_id !== userId) throw new AppException(3005, '无权限操作', HttpStatus.FORBIDDEN);
    if (![1, 2].includes(ride.status)) throw new AppException(1001, '已出发或已结束的约骑不可操作');
    if (ride.departure_time <= new Date()) throw new AppException(1001, '同行开始后不可操作');
    return ride;
  }

  private serializeRide(
    ride: RideRecord,
    latitude?: number,
    longitude?: number,
    presetDistance: number | null = null,
    viewerId?: bigint,
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
      destination_lat: ride.destination_lat?.toString() ?? null,
      destination_lng: ride.destination_lng?.toString() ?? null,
      max_people: ride.max_people,
      join_count: ride.join_count,
      is_full: ride.join_count >= ride.max_people,
      status: ride.status,
      city_code: ride.city_code,
      district_code: ride.district_code,
      points: (ride.points ?? []).map((point) => ({
        id: point.id.toString(),
        order: point.order,
        type: point.type,
        name: point.name,
        address: point.address,
        latitude: point.latitude.toString(),
        longitude: point.longitude.toString(),
        province_code: point.province_code,
        city_code: point.city_code,
        district_code: point.district_code,
        source: point.source,
      })),
      route_snapshot: ride.route_snapshot,
      route_snapshot_version: ride.route_snapshot_version,
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
      route: this.serializeRouteLink(ride.route_links[0], viewerId),
    };
  }

  private rideRegionWhere(query: Pick<RideQueryDto, 'city_code' | 'district_code'>) {
    if (!query.city_code) return {};
    const selected = {
      city_code: query.city_code,
      ...(query.district_code ? { district_code: query.district_code } : {}),
    };
    return {
      OR: [selected, { points: { some: selected } }],
    } satisfies Prisma.RideWhereInput;
  }

  private rideRegionMatch(
    ride: Pick<RideRecord, 'city_code' | 'district_code' | 'points'>,
    query: Pick<RideQueryDto, 'city_code' | 'district_code'>,
  ): 'start' | 'through' | null {
    if (!query.city_code) return null;
    const matches = (city?: string | null, district?: string | null) =>
      city === query.city_code && (!query.district_code || district === query.district_code);
    if (matches(ride.city_code, ride.district_code)) return 'start';
    return ride.points.some((point) => matches(point.city_code, point.district_code))
      ? 'through'
      : null;
  }

  private regionRank(match: 'start' | 'through' | null) {
    return match === 'start' ? 0 : match === 'through' ? 1 : 2;
  }

  private async validateRouteLink(
    tx: Prisma.TransactionClient,
    routeId: bigint,
  ): Promise<RideRoutePlan> {
    await this.flags.assertEnabled('route.link_enabled');
    const route = await tx.route.findFirst({
      where: { id: routeId, status: 1, deleted_at: null },
      select: {
        id: true,
        title: true,
        city_code: true,
        district_code: true,
        distance_km: true,
        duration_min: true,
        polyline: true,
        external_route_url: true,
        points: { orderBy: { order: 'asc' } },
      },
    });
    if (!route) throw new AppException(53001, '所选路线已下架或不可关联', HttpStatus.CONFLICT);
    const start = route.points.find((point) => point.type === 'start') ?? route.points[0];
    if (!start)
      throw new AppException(53003, '路线缺少有效起点，请先修复路线', HttpStatus.CONFLICT);
    const points: RidePointInput[] = route.points
      .filter((point) => point.type !== 'start')
      .map((point) => ({
        type: point.type === 'end' ? 'destination' : 'waypoint',
        name: point.name,
        address: point.address ?? point.description,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        province_code: point.province_code,
        city_code: point.city_code,
        district_code: point.district_code,
        source: 'official-route',
      }));
    const polyline = this.jsonPolyline(route.polyline);
    return {
      type: 'official',
      id: route.id,
      title: route.title,
      start: {
        name: start.name,
        latitude: Number(start.latitude),
        longitude: Number(start.longitude),
        province_code: start.province_code ?? '650000',
        city_code: start.city_code ?? route.city_code,
        district_code: start.district_code ?? route.district_code,
      },
      points,
      polyline,
      external_route_url: route.external_route_url,
      snapshot: {
        source_type: 'official',
        source_id: route.id.toString(),
        title: route.title,
        points: points as unknown as Prisma.InputJsonArray,
        polyline: polyline as unknown as Prisma.InputJsonArray,
        distance_km: route.distance_km?.toString() ?? null,
        duration_min: route.duration_min,
        external_route_url: route.external_route_url,
        customized: false,
      },
    };
  }

  private async validateUserRouteLink(
    tx: Prisma.TransactionClient,
    routeId: bigint,
    userId: bigint,
  ): Promise<RideRoutePlan> {
    await this.flags.assertEnabled('route.link_enabled');
    const route = await tx.userRoute.findFirst({
      where: {
        id: routeId,
        status: 1,
        OR: [{ visibility: 2 }, { user_id: userId }],
      },
      select: {
        id: true,
        title: true,
        city_code: true,
        district_code: true,
        start_location: true,
        start_lat: true,
        start_lng: true,
        end_location: true,
        end_lat: true,
        end_lng: true,
        waypoints: true,
        total_distance: true,
        estimated_time: true,
        polyline: true,
        external_route_url: true,
        points: { orderBy: { order: 'asc' } },
      },
    });
    if (!route) throw new AppException(53001, '所选用户路线已下架或不可关联', HttpStatus.CONFLICT);
    const routeStart = route.points.find((point) => point.type === 'start');
    const storedPoints: RidePointInput[] = route.points
      .filter((point) => point.type !== 'start')
      .map((point) => ({
        type: point.type === 'end' ? 'destination' : 'waypoint',
        name: point.name,
        address: point.address,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        province_code: point.province_code,
        city_code: point.city_code,
        district_code: point.district_code,
        source: 'user-route',
      }));
    const legacyPoints = this.legacyUserRoutePoints(route);
    const points = storedPoints.length ? storedPoints : legacyPoints;
    const polyline = this.jsonPolyline(route.polyline);
    return {
      type: 'user',
      id: route.id,
      title: route.title,
      start: {
        name: routeStart?.name ?? route.start_location,
        latitude: Number(routeStart?.latitude ?? route.start_lat),
        longitude: Number(routeStart?.longitude ?? route.start_lng),
        province_code: routeStart?.province_code ?? '650000',
        city_code: routeStart?.city_code ?? route.city_code,
        district_code: routeStart?.district_code ?? route.district_code,
      },
      points,
      polyline,
      external_route_url: route.external_route_url,
      snapshot: {
        source_type: 'user',
        source_id: route.id.toString(),
        title: route.title,
        points: points as unknown as Prisma.InputJsonArray,
        polyline: polyline as unknown as Prisma.InputJsonArray,
        distance_km: route.total_distance,
        duration_min: route.estimated_time,
        external_route_url: route.external_route_url,
        customized: false,
      },
    };
  }

  private manualRidePoints(
    waypoints: CreateRideDto['waypoints'],
    destination?: CreateRideDto['destination_point'],
  ): RidePointInput[] {
    return [
      ...(waypoints ?? []).map((point) => ({
        ...point,
        type: 'waypoint' as const,
        source: 'manual',
      })),
      ...(destination ? [{ ...destination, type: 'destination' as const, source: 'manual' }] : []),
    ];
  }

  private legacyUserRoutePoints(route: {
    waypoints: Prisma.JsonValue | null;
    end_location: string | null;
    end_lat: Prisma.Decimal | null;
    end_lng: Prisma.Decimal | null;
  }): RidePointInput[] {
    const waypoints: RidePointInput[] = Array.isArray(route.waypoints)
      ? route.waypoints.flatMap((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const name = typeof value.name === 'string' ? value.name : '途经点';
          const latitude = Number(value.latitude);
          const longitude = Number(value.longitude);
          return Number.isFinite(latitude) && Number.isFinite(longitude)
            ? [{ type: 'waypoint' as const, name, latitude, longitude, source: 'user-route' }]
            : [];
        })
      : [];
    if (route.end_location && route.end_lat && route.end_lng) {
      waypoints.push({
        type: 'destination',
        name: route.end_location,
        latitude: Number(route.end_lat),
        longitude: Number(route.end_lng),
        source: 'user-route',
      });
    }
    return waypoints;
  }

  private jsonPolyline(value: Prisma.JsonValue | null) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ latitude, longitude }]
        : [];
    });
  }

  private serializeRouteLink(
    link: RideRecord['route_links'][number] | undefined,
    viewerId?: bigint,
  ) {
    if (!link) return null;
    if (link.user_route) {
      const route = link.user_route;
      const canOpen = route.status === 1 && (route.visibility === 2 || route.user_id === viewerId);
      const canExpose = route.visibility === 2 || route.user_id === viewerId;
      return {
        id: route.id.toString(),
        source_type: 'user' as const,
        title: canExpose ? route.title : '发起人的私密路线',
        city_code: null,
        city_name: null,
        difficulty: canExpose ? route.difficulty : null,
        distance_km: canExpose ? (route.total_distance?.toString() ?? null) : null,
        start_name: canExpose ? route.start_location : null,
        end_name: canExpose ? route.end_location : null,
        available: canOpen,
      };
    }
    const route = link.route;
    if (!route) return null;
    const start = route.points.find((point) => point.type === 'start') ?? route.points[0];
    const end = route.points.find((point) => point.type === 'end') ?? route.points.at(-1);
    return {
      id: route.id.toString(),
      source_type: 'official' as const,
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

  private distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const a =
      Math.sin(radians(lat2 - lat1) / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
    return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  }
}
