import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
export class MineActivityDto {
  @IsIn(['created', 'registered']) type!: 'created' | 'registered';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number = 20;
}
