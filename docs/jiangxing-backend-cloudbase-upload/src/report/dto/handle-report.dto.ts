import { IsIn, IsOptional, IsString, Length } from 'class-validator';
export class HandleReportDto {
  @IsIn(['offline', 'ban', 'ignore']) action!: 'offline' | 'ban' | 'ignore';
  @IsOptional() @IsString() @Length(1, 500) handling_note?: string;
}
