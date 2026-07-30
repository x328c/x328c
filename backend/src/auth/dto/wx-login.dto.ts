import { IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';

export class WxLoginDto {
  @IsString()
  @Length(1, 128)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar_url?: string;
}
