import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ROUTE_DIFFICULTIES, ROUTE_TYPES } from '../route.constants';

export class RouteListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  city_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  district_code?: string;

  @IsOptional()
  @IsIn(['any', 'start', 'through'])
  region_scope?: 'any' | 'start' | 'through' = 'any';

  @IsOptional()
  @IsIn(ROUTE_TYPES)
  type?: (typeof ROUTE_TYPES)[number];

  @IsOptional()
  @IsIn(ROUTE_DIFFICULTIES)
  difficulty?: (typeof ROUTE_DIFFICULTIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
