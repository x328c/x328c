import { IsString, MaxLength, MinLength } from 'class-validator';

export class OfflineRouteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
