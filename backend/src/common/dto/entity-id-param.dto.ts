import { IsNumberString, Length } from 'class-validator';

export class EntityIdParamDto {
  @IsNumberString({ no_symbols: true })
  @Length(1, 32)
  id!: string;
}
