import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ROUTE_STATUS } from '../route.constants';

export class AdminRouteQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(Object.values(ROUTE_STATUS))
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  city_code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}
