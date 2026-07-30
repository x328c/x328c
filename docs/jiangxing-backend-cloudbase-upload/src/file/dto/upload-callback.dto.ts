import { IsInt, IsMimeType, IsString, IsUrl, Length, Max, Min } from 'class-validator';

export class UploadCallbackDto {
  @IsString() @Length(1, 255) file_key!: string;
  @IsUrl({ require_tld: false }) @Length(1, 500) file_url!: string;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024) file_size!: number;
  @IsMimeType() @IsString() file_type!: string;
}
