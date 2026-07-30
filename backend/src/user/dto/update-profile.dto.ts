import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 50) nickname?: string;
  @IsOptional() @IsUrl({ require_tld: false }) @Length(1, 255) avatar_url?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1, 2]) gender?: number;
  @IsOptional() @IsString() @Length(1, 100) motorcycle_model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) riding_years?: number;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 20, { each: true })
  riding_styles?: string[];
  @IsOptional() @IsString() @Length(1, 50) province?: string;
  @IsOptional() @IsString() @Length(1, 50) city?: string;
  @IsOptional() @IsString() @Length(1, 50) district?: string;
  @IsOptional() @IsString() @Length(1, 20) city_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1, 2]) location_visible?: number;
  @IsOptional() @IsString() @Length(1, 200) bio?: string;
  @IsOptional() @IsString() @Length(1, 50) wechat_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1, 2]) wechat_visible?: number;
}
