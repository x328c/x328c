import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
export class CreateReportDto {
  @IsIn(['ride', 'activity', 'user']) content_type!: 'ride' | 'activity' | 'user';
  @IsNumberString({ no_symbols: true }) content_id!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10) reason!: number;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}
