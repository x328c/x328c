import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RideQueryDto {
  @IsOptional() @IsString() city_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2, 3, 4, 5]) ride_style?: number;
  @IsOptional() @IsDateString() start_time?: string;
  @IsOptional() @IsDateString() end_time?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) radius?: number = 10;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
