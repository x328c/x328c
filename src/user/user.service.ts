import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

type ProfileRecord = Prisma.UserGetPayload<{ include: { profile: true } }>;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getCurrentProfile(userId: bigint) {
    const user = await this.findActiveUser(userId);
    return this.toOwnerProfile(user);
  }

  async updateProfile(userId: bigint, dto: UpdateProfileDto) {
    const { nickname, avatar_url, gender, ...profileData } = dto;
    const userData: Prisma.UserUpdateInput = {};
    if (nickname !== undefined) userData.nickname = nickname;
    if (avatar_url !== undefined) userData.avatar_url = avatar_url;
    if (gender !== undefined) userData.gender = gender;

    const profileUpdate: Prisma.UserProfileUpdateWithoutUserInput = {};
    for (const [key, value] of Object.entries(profileData)) {
      if (value !== undefined) {
        (profileUpdate as Record<string, unknown>)[key] = value;
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...userData,
        profile: {
          upsert: {
            create: profileUpdate as Prisma.UserProfileCreateWithoutUserInput,
            update: profileUpdate,
          },
        },
      },
      include: { profile: true },
    });
    return this.toOwnerProfile(user);
  }

  async getPublicProfile(viewerId: bigint, userId: bigint) {
    const user = await this.findActiveUser(userId);
    const profile = user.profile;
    const canViewWechat = await this.canViewWechat(viewerId, userId, profile?.wechat_visible ?? 0);
    const canViewLocation = profile?.location_visible === 2;

    return {
      id: user.id.toString(),
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      gender: user.gender,
      motorcycle_model: profile?.motorcycle_model ?? null,
      riding_years: profile?.riding_years ?? null,
      riding_styles: profile?.riding_styles ?? null,
      province: profile?.province ?? null,
      city: profile?.city ?? null,
      district: profile?.district ?? null,
      city_code: profile?.city_code ?? null,
      bio: profile?.bio ?? null,
      wechat_id: canViewWechat ? (profile?.wechat_id ?? null) : null,
      location:
        canViewLocation && profile?.location_lat && profile.location_lng
          ? { lat: profile.location_lat.toString(), lng: profile.location_lng.toString() }
          : null,
    };
  }

  async updateLocation(userId: bigint, dto: UpdateLocationDto) {
    const user = await this.findActiveUser(userId);
    const profile = user.profile;
    const date = new Date().toISOString().slice(0, 10);
    const seed = this.createLocationSeed(userId, date);
    const isSameDayLocation = Boolean(
      profile?.location_offset_seed === seed &&
      profile.location_lat !== null &&
      profile.location_lng !== null,
    );
    const location = isSameDayLocation
      ? { lat: profile!.location_lat!, lng: profile!.location_lng!, reused: true }
      : this.obfuscateLocation(dto.latitude, dto.longitude, seed);

    const previousCityCode = profile?.city_code;
    await this.prisma.userProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        city_code: dto.city_code,
        location_lat: location.lat,
        location_lng: location.lng,
        location_offset_seed: seed,
      },
      update: isSameDayLocation
        ? {}
        : {
            city_code: dto.city_code,
            location_lat: location.lat,
            location_lng: location.lng,
            location_offset_seed: seed,
          },
    });

    if (previousCityCode && previousCityCode !== dto.city_code) {
      await this.redisService.geoRemove(`geo:users:${previousCityCode}`, userId.toString());
    }
    await this.redisService.geoAdd(
      `geo:users:${dto.city_code}`,
      Number(location.lng),
      Number(location.lat),
      userId.toString(),
    );

    return {
      city_code: dto.city_code,
      location: { lat: location.lat.toString(), lng: location.lng.toString() },
      reused: isSameDayLocation,
    };
  }

  private async findActiveUser(userId: bigint): Promise<ProfileRecord> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null, status: 1 },
      include: { profile: true },
    });
    if (!user) throw new AppException(2001, '用户不存在或已被禁用', HttpStatus.NOT_FOUND);
    return user;
  }

  private toOwnerProfile(user: ProfileRecord) {
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
      profile: user.profile
        ? {
            motorcycle_model: user.profile.motorcycle_model,
            riding_years: user.profile.riding_years,
            riding_styles: user.profile.riding_styles,
            province: user.profile.province,
            city: user.profile.city,
            district: user.profile.district,
            city_code: user.profile.city_code,
            location_visible: user.profile.location_visible,
            wechat_id: user.profile.wechat_id,
            wechat_visible: user.profile.wechat_visible,
            bio: user.profile.bio,
          }
        : null,
    };
  }

  private async canViewWechat(
    viewerId: bigint,
    ownerId: bigint,
    visibility: number,
  ): Promise<boolean> {
    if (viewerId === ownerId) return true;
    if (visibility === 2) return true;
    if (visibility !== 1) return false;
    return Boolean(
      await this.prisma.rideParticipant.findFirst({
        where: { user_id: viewerId, status: 1, ride: { user_id: ownerId, deleted_at: null } },
        select: { id: true },
      }),
    );
  }

  private createLocationSeed(userId: bigint, date: string): string {
    return createHash('sha256').update(`${userId.toString()}:${date}`).digest('hex').slice(0, 32);
  }

  private obfuscateLocation(latitude: number, longitude: number, seed: string) {
    const offset = (axis: 'lat' | 'lng'): number => {
      const digest = createHash('sha256').update(`${seed}:${axis}`).digest();
      const raw = digest.readUInt32BE(0);
      const magnitude = 0.003 + (raw / 0xffffffff) * 0.005;
      return (raw % 2 === 0 ? 1 : -1) * magnitude;
    };
    return {
      lat: new Prisma.Decimal((latitude + offset('lat')).toFixed(7)),
      lng: new Prisma.Decimal((longitude + offset('lng')).toFixed(7)),
      reused: false,
    };
  }
}
