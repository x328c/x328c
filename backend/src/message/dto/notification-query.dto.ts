import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class NotificationQueryDto {
  @IsOptional() @IsIn(['all', 'ride_activity', 'system']) category?:
    'all' | 'ride_activity' | 'system' = 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
