import { IsNumberString } from 'class-validator';
export class RemoveRegistrationDto {
  @IsNumberString({ no_symbols: true }) user_id!: string;
}
