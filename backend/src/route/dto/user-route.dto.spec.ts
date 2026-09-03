import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserRouteDto } from './user-route.dto';

describe('CreateUserRouteDto', () => {
  const valid = {
    title: '周末山路',
    start_location: '公共停车场',
    start_lat: 30.1234567,
    start_lng: 120.1234567,
    city_code: '650100',
    visibility: 2,
  };

  it('accepts a complete public route with up to six images', async () => {
    const dto = plainToInstance(CreateUserRouteDto, {
      ...valid,
      end_location: '景区入口',
      end_lat: 30.5,
      end_lng: 120.5,
      end_point: {
        name: '景区入口',
        latitude: 30.5,
        longitude: 120.5,
        province_code: '650000',
        city_code: '650100',
      },
      images: Array.from({ length: 6 }, (_, index) => `https://cdn.example.com/${index}.jpg`),
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid coordinates, difficulty and more than six images', async () => {
    const dto = plainToInstance(CreateUserRouteDto, {
      ...valid,
      start_lat: 91,
      difficulty: 6,
      images: Array.from({ length: 7 }, (_, index) => `https://cdn.example.com/${index}.jpg`),
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['start_lat', 'difficulty', 'images']));
  });

  it('accepts an empty external route URL so an existing link can be cleared', async () => {
    const dto = plainToInstance(CreateUserRouteDto, {
      ...valid,
      external_route_url: '',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
