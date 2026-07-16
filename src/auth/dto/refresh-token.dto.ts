import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @IsJWT()
  refresh_token!: string;
}
