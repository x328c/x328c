import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { IsIn } from 'class-validator';
import { OptionalAgreementDto } from '../../safety/dto/agreement.dto';

const normalizeCoordinate = ({ value }: { value: unknown }) => {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? Number(coordinate.toFixed(7)) : value;
};

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && !value.trim() ? undefined : value;

const emptyOptionalPointToUndefined = ({ value }: { value: unknown }) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const point = value as { name?: unknown; address?: unknown };
  const name = typeof point.name === 'string' ? point.name.trim() : '';
  const address = typeof point.address === 'string' ? point.address.trim() : '';
  return name || address ? value : undefined;
};

export class RideLocationPointDto {
  @IsString() @Length(1, 80) name!: string;
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  @Length(1, 300)
  address?: string;
  @Transform(normalizeCoordinate)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude!: number;
  @Transform(normalizeCoordinate)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude!: number;
  @IsOptional() @IsString() @Length(1, 20) province_code?: string;
  @IsOptional() @IsString() @Length(1, 20) city_code?: string;
  @IsOptional() @IsString() @Length(1, 20) district_code?: string;
}

export class CreateRideDto extends OptionalAgreementDto {
  @IsString() @Length(1, 50) title!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) ride_style!: number;
  @IsDateString() departure_time!: string;
  @IsString() @Length(1, 200) meetup_address!: string;
  @Transform(normalizeCoordinate)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  meetup_lat!: number;
  @Transform(normalizeCoordinate)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  meetup_lng!: number;
  @IsOptional() @IsString() @Length(1, 200) destination?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RideLocationPointDto)
  waypoints?: RideLocationPointDto[];
  @IsOptional()
  @Transform(emptyOptionalPointToUndefined)
  @ValidateNested()
  @Type(() => RideLocationPointDto)
  destination_point?: RideLocationPointDto;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) min_people!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) max_people!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(3) speed_level!: number;
  @IsOptional() @IsString() @Length(1, 100) bike_requirement?: string;
  @IsOptional() @IsString() @Length(1, 5000) description?: string;
  @IsOptional() @IsObject() rules?: Record<string, unknown>;
  @IsString() @Length(1, 20) city_code!: string;
  @IsOptional() @IsString() @Length(1, 20) district_code?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) @Length(1, 32) route_id?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) @Length(1, 32) user_route_id?: string;
  @IsOptional() @IsIn(['route_detail', 'create_form']) route_link_source?:
    'route_detail' | 'create_form';
  @IsOptional() @IsBoolean() route_customized?: boolean;
}
