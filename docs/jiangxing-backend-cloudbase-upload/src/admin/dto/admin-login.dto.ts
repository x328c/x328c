import { IsString, Length } from 'class-validator';
export class AdminLoginDto {
  @IsString() @Length(1, 50) username!: string;
  @IsString() @Length(6, 100) password!: string;
}
