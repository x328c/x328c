import { IsString, Length } from 'class-validator';

export class WxLoginDto {
  @IsString()
  @Length(1, 128)
  code!: string;
}
