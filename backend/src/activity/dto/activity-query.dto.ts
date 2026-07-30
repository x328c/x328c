import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2, 3, 4]) activity_type?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([1, 2, 3]) fee_type?: number;
  @IsOptional() @IsDateString() start_time?: string;
  @IsOptional() @IsDateString() end_time?: string;
  @IsOptional() @IsString() city_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
