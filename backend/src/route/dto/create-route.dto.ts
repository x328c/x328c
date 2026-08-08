import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ROUTE_DIFFICULTIES, ROUTE_LIMITS, ROUTE_TYPES } from '../route.constants';
import { PolylinePointDto, RoutePointDto } from './route-point.dto';

export class CreateRouteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  cover_image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROUTE_LIMITS.images)
  @IsUrl({ require_protocol: true }, { each: true })
  @MaxLength(500, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  city_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city_name?: string;

  @IsOptional()
  @IsIn(ROUTE_TYPES)
  type?: (typeof ROUTE_TYPES)[number];

  @IsOptional()
  @IsIn(ROUTE_DIFFICULTIES)
  difficulty?: (typeof ROUTE_DIFFICULTIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(999999.99)
  distance_km?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(525600)
  duration_min?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROUTE_LIMITS.polylinePoints)
  @ValidateNested({ each: true })
  @Type(() => PolylinePointDto)
  polyline?: PolylinePointDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  road_condition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  suitable_motorcycles?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  best_season?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  safety_notice?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  sort_weight?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROUTE_LIMITS.points)
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  points?: RoutePointDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ROUTE_LIMITS.relatedRides)
  @Matches(/^\d+$/, { each: true })
  related_ride_ids?: string[];
}
