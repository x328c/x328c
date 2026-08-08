import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
export class AdminReportQueryDto {
  @IsOptional()
  @IsIn(['ride', 'activity', 'user', 'forum_post', 'forum_reply'])
  content_type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2) status?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
