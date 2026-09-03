import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRideDto } from './create-ride.dto';

describe('CreateRideDto', () => {
  it('normalizes high-precision WeChat map coordinates to database precision', async () => {
    const dto = plainToInstance(CreateRideDto, {
      title: '测试约骑',
      ride_style: 3,
      departure_time: '2026-09-03T06:30:00.000Z',
      meetup_address: '太原路社区卫生服务站',
      meetup_lat: 43.873405,
      meetup_lng: 87.55165,
      waypoints: [
        {
          name: '沙依巴克区紫金公园',
          latitude: 43.765663425188684,
          longitude: 87.4569923348999,
        },
      ],
      min_people: 2,
      max_people: 6,
      speed_level: 2,
      city_code: '650100',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.waypoints?.[0]).toMatchObject({
      latitude: 43.7656634,
      longitude: 87.4569923,
    });
  });

  it('still rejects coordinates outside valid latitude and longitude ranges', async () => {
    const dto = plainToInstance(CreateRideDto, {
      title: '测试约骑',
      ride_style: 3,
      departure_time: '2026-09-03T06:30:00.000Z',
      meetup_address: '测试集合点',
      meetup_lat: 91.123456789,
      meetup_lng: 181.123456789,
      min_people: 2,
      max_people: 6,
      speed_level: 2,
      city_code: '650100',
    });

    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['meetup_lat', 'meetup_lng']));
  });

  it('treats an empty optional destination returned by devtools as not selected', async () => {
    const dto = plainToInstance(CreateRideDto, {
      title: '测试约骑',
      ride_style: 1,
      departure_time: '2026-09-03T06:30:00.000Z',
      meetup_address: '太原路社区卫生服务站',
      meetup_lat: 43.873405,
      meetup_lng: 87.55165,
      destination_point: {
        name: '',
        address: '',
        latitude: 23.129163,
        longitude: 113.264435,
        province_code: '650000',
        city_code: '650100',
      },
      min_people: 2,
      max_people: 6,
      speed_level: 2,
      city_code: '650100',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.destination_point).toBeUndefined();
  });
});
