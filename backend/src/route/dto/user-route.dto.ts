import { PartialType } from '@nestjs/mapped-types';
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
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UserRouteWaypointDto {
  @IsString() @Length(1, 200) name!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
}

export class CreateUserRouteDto {
  @IsString() @Length(1, 100) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsString() @Length(1, 200) start_location!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) start_lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) start_lng!: number;
  @IsOptional() @IsString() @Length(1, 200) end_location?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) end_lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) end_lng?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => UserRouteWaypointDto)
  waypoints?: UserRouteWaypointDto[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) total_distance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) estimated_time?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  @MaxLength(500, { each: true })
  images?: string[];
  @IsOptional() @Type(() => Number) @IsIn([1, 2]) visibility: 1 | 2 = 1;
}

export class UpdateUserRouteDto extends PartialType(CreateUserRouteDto) {}

export class UserRouteMineQueryDto {
  @IsOptional() @Type(() => Number) @IsIn([1, 2]) visibility?: 1 | 2;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class UserRoutePublicQueryDto extends UserRouteMineQueryDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) max_distance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) min_distance?: number;
}
