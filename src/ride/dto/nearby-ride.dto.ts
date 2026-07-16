import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class NearbyRideDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsString() city_code!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) radius?: number = 10;
}
