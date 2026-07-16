import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
export class StatsTrendDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([7, 30]) days?: number = 7;
}
