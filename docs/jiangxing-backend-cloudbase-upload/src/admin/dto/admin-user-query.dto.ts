import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
export class AdminUserQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1) status?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}
