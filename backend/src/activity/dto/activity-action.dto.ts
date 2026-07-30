import { IsString, Length } from 'class-validator';
export class ActivityActionDto {
  @IsString() @Length(1, 500) content!: string;
}
