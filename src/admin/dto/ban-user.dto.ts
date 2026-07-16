import { IsString, Length } from 'class-validator';
export class BanUserDto {
  @IsString() @Length(1, 500) reason!: string;
}
