import { IsNumberString } from 'class-validator';
export class NotificationIdDto {
  @IsNumberString({ no_symbols: true }) id!: string;
}
