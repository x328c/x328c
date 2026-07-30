import { IsNumberString } from 'class-validator';

export class RemoveParticipantDto {
  @IsNumberString({ no_symbols: true })
  user_id!: string;
}
