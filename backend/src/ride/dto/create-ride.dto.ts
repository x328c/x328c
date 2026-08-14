import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { IsIn } from 'class-validator';
import { OptionalAgreementDto } from '../../safety/dto/agreement.dto';

export class CreateRideDto extends OptionalAgreementDto {
  @IsString() @Length(1, 50) title!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ride_style!: number;
  @IsDateString() departure_time!: string;
  @IsString() @Length(1, 200) meetup_address!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) meetup_lat!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) meetup_lng!: number;
  @IsOptional() @IsString() @Length(1, 200) destination?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) min_people!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) max_people!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(3) speed_level!: number;
  @IsOptional() @IsString() @Length(1, 100) bike_requirement?: string;
  @IsOptional() @IsString() @Length(1, 5000) description?: string;
  @IsOptional() @IsObject() rules?: Record<string, unknown>;
  @IsString() @Length(1, 20) city_code!: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) @Length(1, 32) route_id?: string;
  @IsOptional() @IsIn(['route_detail', 'create_form']) route_link_source?:
    'route_detail' | 'create_form';
}
