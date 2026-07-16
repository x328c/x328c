import { IsJWT, IsOptional } from 'class-validator';

export class LogoutDto {
  @IsOptional()
  @IsJWT()
  refresh_token?: string;
}
