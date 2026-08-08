import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ROUTE_POINT_TYPES } from '../route.constants';

export class RoutePointDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order!: number;

  @IsString()
  @MaxLength(80)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude!: number;

  @IsIn(ROUTE_POINT_TYPES)
  type!: (typeof ROUTE_POINT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class PolylinePointDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude!: number;
}
