import { IsNumberString } from 'class-validator';

export class UserIdParamDto {
  @IsNumberString({ no_symbols: true })
  id!: string;
}
