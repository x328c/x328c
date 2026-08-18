import { IsNumberString, Length } from 'class-validator';

export class TransferCreatorDto {
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  target_user_id!: string;
}
