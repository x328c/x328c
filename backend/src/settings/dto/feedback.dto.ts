import { IsIn, IsNumberString, IsOptional, IsString, Length } from 'class-validator';

export class CreateFeedbackDto {
  @IsIn(['general', 'content_error', 'source_broken', 'product'])
  type!: 'general' | 'content_error' | 'source_broken' | 'product';
  @IsString() @Length(2, 1000) description!: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) @Length(1, 32) file_record_id?: string;
}
