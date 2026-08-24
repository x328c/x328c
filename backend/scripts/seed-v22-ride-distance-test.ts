import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * V2.2 同行距离排序专用测试数据。
 *
 * 参考位置（在开发者工具中模拟）：43.8256000, 87.6168000
 * 有定位时预期顺序：A -> B -> C -> D -> E
 * 无定位时预期顺序：B -> D -> E -> C -> A（按发布时间由新到旧）
 */
const prisma = new PrismaClient();
const confirmation = process.env.MODAZI_RIDE_DISTANCE_SEED_CONFIRM;

if (process.env.NODE_ENV === 'production' || confirmation !== '1') {
  throw new Error(
    '拒绝执行距离测试 seed：请在非生产测试库设置 MODAZI_RIDE_DISTANCE_SEED_CONFIRM=1',
  );
}

const reference = { latitude: 43.8256, longitude: 87.6168 };
const now = new Date();
const hour = 60 * 60 * 1000;
const minute = 60 * 1000;
const day = 24 * hour;

const fixtures = [
  {
    code: 'A',
    title: '[距离排序测试] A·红山晨间轻骑',
    address: '红山公园周边测试集合点（约 0.5 km）',
    latitude: 43.8301,
    longitude: 87.6168,
    publicationOffsetMinutes: 300,
    departureOffsetDays: 3,
    rideStyle: 1,
    speedLevel: 1,
  },
  {
    code: 'B',
    title: '[距离排序测试] B·城市夜骑',
    address: '友好路周边测试集合点（约 2.8 km）',
    latitude: 43.8256,
    longitude: 87.6518,
    publicationOffsetMinutes: 60,
    departureOffsetDays: 4,
    rideStyle: 2,
    speedLevel: 1,
  },
  {
    code: 'C',
    title: '[距离排序测试] C·水磨沟休闲骑',
    address: '水磨沟周边测试集合点（约 5.2 km）',
    latitude: 43.7788,
    longitude: 87.6168,
    publicationOffsetMinutes: 240,
    departureOffsetDays: 5,
    rideStyle: 1,
    speedLevel: 2,
  },
  {
    code: 'D',
    title: '[距离排序测试] D·周末跑山热身',
    address: '城市北侧测试集合点（约 9.5 km）',
    latitude: 43.8256,
    longitude: 87.7353,
    publicationOffsetMinutes: 120,
    departureOffsetDays: 6,
    rideStyle: 3,
    speedLevel: 2,
  },
  {
    code: 'E',
    title: '[距离排序测试] E·南山摩旅准备',
    address: '南山方向测试集合点（约 31 km）',
    latitude: 44.1046,
    longitude: 87.6168,
    publicationOffsetMinutes: 180,
    departureOffsetDays: 7,
    rideStyle: 4,
    speedLevel: 2,
  },
] as const;

function distanceKm(latitude: number, longitude: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitude - reference.latitude);
  const longitudeDelta = toRadians(longitude - reference.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(reference.latitude)) *
      Math.cos(toRadians(latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  const owner = await prisma.user.upsert({
    where: { openid: 'v22-distance-test-owner' },
    update: {
      nickname: 'V2.2距离测试骑友',
      status: 1,
      deleted_at: null,
    },
    create: {
      openid: 'v22-distance-test-owner',
      nickname: 'V2.2距离测试骑友',
      status: 1,
    },
  });
  await prisma.userProfile.upsert({
    where: { user_id: owner.id },
    update: { city: '乌鲁木齐市', city_code: '650100', deleted_at: null },
    create: { user_id: owner.id, city: '乌鲁木齐市', city_code: '650100' },
  });

  const imported: Array<{ code: string; id: string; distance: number; publishedAt: Date }> = [];
  for (const fixture of fixtures) {
    const createdAt = new Date(now.getTime() - fixture.publicationOffsetMinutes * minute);
    const departureTime = new Date(now.getTime() + fixture.departureOffsetDays * day);
    const existing = await prisma.ride.findFirst({
      where: { title: fixture.title, user_id: owner.id },
      select: { id: true },
    });
    const data = {
      title: fixture.title,
      ride_style: fixture.rideStyle,
      departure_time: departureTime,
      meetup_address: fixture.address,
      meetup_lat: new Prisma.Decimal(fixture.latitude),
      meetup_lng: new Prisma.Decimal(fixture.longitude),
      destination: '乌鲁木齐市内安全测试终点',
      min_people: 2,
      max_people: 8,
      speed_level: fixture.speedLevel,
      bike_requirement: '证照齐全、车辆状态良好、佩戴合规护具',
      description: 'V2.2 距离排序与距离筛选验收数据，仅用于测试环境。',
      rules: { safety_first: true, test_fixture: 'v2.2-distance-sort' },
      status: 1,
      audit_status: 1,
      join_count: 1,
      city_code: '650100',
      created_at: createdAt,
      deleted_at: null,
    };
    const ride = existing
      ? await prisma.ride.update({ where: { id: existing.id }, data })
      : await prisma.ride.create({ data: { ...data, user_id: owner.id } });

    await prisma.$transaction([
      prisma.rideParticipant.deleteMany({ where: { ride_id: ride.id } }),
      prisma.rideParticipant.create({
        data: {
          ride_id: ride.id,
          user_id: owner.id,
          status: 1,
          is_creator: true,
          joined_at: createdAt,
          created_at: createdAt,
        },
      }),
    ]);
    imported.push({
      code: fixture.code,
      id: ride.id.toString(),
      distance: Number(distanceKm(fixture.latitude, fixture.longitude).toFixed(2)),
      publishedAt: createdAt,
    });
  }

  console.table(imported);
  console.log(`模拟位置：${reference.latitude}, ${reference.longitude}`);
  console.log('有定位预期：A -> B -> C -> D -> E');
  console.log('无定位预期：B -> D -> E -> C -> A');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
