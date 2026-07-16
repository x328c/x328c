import { Type } from 'class-transformer';
import { IsNumber, IsString, Length, Max, Min } from 'class-validator';

export class UpdateLocationDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) latitude!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) longitude!: number;
  @IsString() @Length(1, 20) city_code!: string;
}
