import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
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
    if (profileData.wechat_id !== undefined) {
      const normalized = this.normalizeWechatId(profileData.wechat_id);
      const duplicate = await this.prisma.userProfile.findFirst({
        where: { wechat_id_normalized: normalized, user_id: { not: userId }, deleted_at: null },
        select: { id: true },
      });
      if (duplicate) throw new AppException(51111, '该微信号已被使用', HttpStatus.CONFLICT);
      profileData.wechat_id = profileData.wechat_id.normalize('NFKC').trim();
      (profileData as typeof profileData & { wechat_id_normalized?: string }).wechat_id_normalized =
        normalized;
    }
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

  async assertProfileComplete(userId: bigint): Promise<void> {
    const user = await this.findActiveUser(userId);
    const missing = this.missingProfileFields(user);
    if (missing.length) {
      throw new AppException(
        51110,
        `请先完善个人资料：${missing.join('、')}`,
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
  }

  async getPublicProfile(viewerId: bigint, userId: bigint) {
    const user = await this.findActiveUser(userId);
    const profile = user.profile;
    const setting = await this.prisma.userSetting.findUnique({ where: { user_id: userId } });
    const visibility = setting?.profile_visibility ?? 'public';
    const isOwner = viewerId === userId;
    const needsRelationship =
      visibility === 'participants' ||
      profile?.wechat_visible === 1 ||
      Boolean(setting?.contact_visible);
    const sharesActivity =
      isOwner || (needsRelationship && (await this.hasSharedParticipation(viewerId, userId)));
    if (!isOwner && visibility === 'private')
      throw new AppException(2003, '该用户已隐藏个人资料', HttpStatus.FORBIDDEN);
    if (!isOwner && visibility === 'participants' && !sharesActivity)
      throw new AppException(2003, '仅共同同行或活动参与者可查看', HttpStatus.FORBIDDEN);
    const canViewWechat =
      isOwner ||
      profile?.wechat_visible === 2 ||
      Boolean((profile?.wechat_visible === 1 || setting?.contact_visible) && sharesActivity);
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

  /** 按资料中的微信号可见范围返回联系方式，供同行详情等场景复用。 */
  async getVisibleWechat(viewerId: bigint | undefined, userId: bigint): Promise<string | null> {
    const user = await this.findActiveUser(userId);
    const profile = user.profile;
    if (!profile?.wechat_id) return null;
    if (viewerId === userId || profile.wechat_visible === 2) return profile.wechat_id;
    if (!viewerId) return null;
    const setting = await this.prisma.userSetting.findUnique({ where: { user_id: userId } });
    if (profile.wechat_visible !== 1 && !setting?.contact_visible) return null;
    return (await this.hasSharedParticipation(viewerId, userId)) ? profile.wechat_id : null;
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

  async closeAccount(userId: bigint, confirmed: true) {
    if (!confirmed) throw new AppException(2004, '请确认注销账号', HttpStatus.BAD_REQUEST);
    const user = await this.findActiveUser(userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          openid: `deleted:${userId.toString()}:${randomUUID().slice(0, 16)}`,
          unionid: null,
          nickname: '已注销用户',
          avatar_url: null,
          gender: 0,
          phone: null,
          status: 0,
          last_login_at: null,
          deleted_at: now,
        },
      });
      await tx.userProfile.updateMany({
        where: { user_id: userId },
        data: {
          motorcycle_model: null,
          riding_years: null,
          riding_styles: Prisma.DbNull,
          province: null,
          city: null,
          district: null,
          city_code: null,
          location_lat: null,
          location_lng: null,
          location_offset_seed: null,
          location_visible: 0,
          bio: null,
          wechat_id: null,
          wechat_id_normalized: null,
          wechat_visible: 0,
          deleted_at: now,
        },
      });
      await tx.userSetting.deleteMany({ where: { user_id: userId } });
      await tx.routeComment.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: now, published_at: null },
      });
      await tx.forumPost.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: now, published_at: null },
      });
      await tx.forumReply.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { deleted_at: now, published_at: null },
      });
      await tx.activityRegistration.updateMany({
        where: { user_id: userId },
        data: { real_name: null, phone: null, emergency_contact: null, remark: null },
      });
      await tx.appFeedback.updateMany({
        where: { user_id: userId },
        data: { user_id: null },
      });
      await tx.notification.deleteMany({ where: { user_id: userId } });
    });
    if (user.profile?.city_code) {
      await this.redisService
        .geoRemove(`geo:users:${user.profile.city_code}`, userId.toString())
        .catch(() => undefined);
    }
    return { success: true };
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
    const missing = this.missingProfileFields(user);
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
      profile_complete: missing.length === 0,
      missing_profile_fields: missing,
    };
  }

  private missingProfileFields(user: ProfileRecord): string[] {
    const missing: string[] = [];
    const nickname = user.nickname?.normalize('NFKC').trim();
    if (!nickname || ['新骑友', '微信用户'].includes(nickname)) missing.push('用户名称');
    if (!user.avatar_url) missing.push('头像');
    if (!user.profile?.wechat_id && !user.phone) missing.push('微信号或手机号');
    if (!user.profile?.motorcycle_model) missing.push('车型');
    return missing;
  }

  private normalizeWechatId(value: string): string {
    const normalized = value.normalize('NFKC').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{5,19}$/.test(normalized)) {
      throw new AppException(51112, '微信号需为6至20位并以字母开头');
    }
    return normalized;
  }

  private async hasSharedParticipation(viewerId: bigint, ownerId: bigint): Promise<boolean> {
    const [ride, activity] = await Promise.all([
      this.prisma.ride.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { user_id: ownerId, participants: { some: { user_id: viewerId, status: 1 } } },
            { user_id: viewerId, participants: { some: { user_id: ownerId, status: 1 } } },
            {
              participants: { some: { user_id: ownerId, status: 1 } },
              AND: { participants: { some: { user_id: viewerId, status: 1 } } },
            },
          ],
        },
        select: { id: true },
      }),
      this.prisma.activity.findFirst({
        where: {
          deleted_at: null,
          OR: [
            { user_id: ownerId, registrations: { some: { user_id: viewerId, status: 2 } } },
            { user_id: viewerId, registrations: { some: { user_id: ownerId, status: 2 } } },
            {
              registrations: { some: { user_id: ownerId, status: 2 } },
              AND: { registrations: { some: { user_id: viewerId, status: 2 } } },
            },
          ],
        },
        select: { id: true },
      }),
    ]);
    return Boolean(ride || activity);
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
