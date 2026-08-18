import { IsDateString, IsObject, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateSafetyGuideRevisionDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 120) title!: string;
  @IsString() @Length(1, 500) summary!: string;
  @IsString() @Length(1, 32) version!: string;
  @IsOptional() @IsObject() content_json?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(10, 50000) content_text?: string;
  @IsString() @Length(1, 200) source_title!: string;
  @IsUrl({ require_tld: true }) @Length(1, 1000) source_url!: string;
  @IsString() @Length(1, 150) source_issuer!: string;
  @IsOptional() @IsDateString() source_published_at?: string;
  @IsOptional() @IsDateString() source_effective_at?: string;
  @IsString() @Length(1, 1000) content_note!: string;
  @IsDateString() last_verified_at!: string;
}

export class GuideReasonDto {
  @IsString() @Length(2, 500) reason!: string;
}
