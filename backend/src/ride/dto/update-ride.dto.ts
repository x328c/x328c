import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateRideDto {
  @IsOptional() @IsString() @Length(1, 50) title?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) ride_style?: number;
  @IsOptional() @IsDateString() departure_time?: string;
  @IsOptional() @IsString() @Length(1, 200) meetup_address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) meetup_lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) meetup_lng?: number;
  @IsOptional() @IsString() @Length(1, 200) destination?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) min_people?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) max_people?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3) speed_level?: number;
  @IsOptional() @IsString() @Length(1, 100) bike_requirement?: string;
  @IsOptional() @IsString() @Length(1, 5000) description?: string;
  @IsOptional() @IsObject() rules?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(1, 20) city_code?: string;
  @IsOptional() @IsString() @Length(1, 20) district_code?: string;
}
