import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateActivityDto {
  @IsString() @Length(1, 80) title!: string;
  @IsOptional() @IsUrl({ require_tld: false }) @Length(1, 255) cover_image?: string;
  @Type(() => Number) @IsInt() @IsIn([1, 2, 3, 4]) activity_type!: number;
  @IsDateString() start_time!: string;
  @IsDateString() end_time!: string;
  @IsString() @Length(1, 200) meetup_address!: string;
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) meetup_lat!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) meetup_lng!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(9999) max_people!: number;
  @Type(() => Number) @IsInt() @IsIn([1, 2, 3]) fee_type!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fee_amount?: number;
  @IsOptional() @IsString() @Length(1, 5000) route_description?: string;
  @IsOptional() @IsString() @Length(1, 5000) requirements?: string;
  @IsString() @Length(1, 20000) content!: string;
  @IsString() @Length(1, 50) contact_name!: string;
  @IsString() @Length(1, 50) contact_wechat!: string;
  @Type(() => Boolean) @IsBoolean() need_approval!: boolean;
  @IsString() @Length(1, 20) city_code!: string;
}
