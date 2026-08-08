import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  AUTHORITY_LEVELS,
  FEEDBACK_TYPES,
  REGULATION_CATEGORIES,
  REGULATION_LIMITS,
  REGULATION_SCOPES,
  REGULATION_STATUS,
} from '../regulation.constants';

export class RegulationRegionDto {
  @IsString() @Matches(/^\d{6}$/) region_code!: string;
  @IsString() @MinLength(2) @MaxLength(80) region_name!: string;
}

export class RegulationListQueryDto {
  @IsOptional() @IsIn(REGULATION_CATEGORIES) category?: string;
  @IsOptional() @Matches(/^\d{6}$/) region_code?: string;
  @IsOptional() @IsIn(REGULATION_SCOPES) scope?: string;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsIn([REGULATION_STATUS.EFFECTIVE, REGULATION_STATUS.EXPIRED, REGULATION_STATUS.REPLACED])
  status?: number;
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(REGULATION_LIMITS.maxPageSize) limit =
    REGULATION_LIMITS.pageSize;
}

export class RegulationSearchQueryDto extends RegulationListQueryDto {
  @IsString() @MinLength(1) @MaxLength(100) keyword!: string;
}

export class RegulationFeedbackDto {
  @IsIn(FEEDBACK_TYPES) type!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class RegulationDraftDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) document_no?: string;
  @ValidateIf((item: RegulationDraftDto) => !item.document_no)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  document_no_empty_reason?: string;
  @IsString() @MinLength(2) @MaxLength(150) issuer!: string;
  @IsIn(AUTHORITY_LEVELS) authority_level!: string;
  @IsIn(REGULATION_CATEGORIES) category!: string;
  @IsIn(REGULATION_SCOPES) scope!: string;
  @IsArray()
  @ArrayMaxSize(REGULATION_LIMITS.regions)
  @ValidateNested({ each: true })
  @Type(() => RegulationRegionDto)
  regions!: RegulationRegionDto[];
  @IsArray()
  @ArrayMaxSize(REGULATION_LIMITS.tags)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags!: string[];
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(1000)
  source_url?: string;
  @IsOptional() @IsDateString() published_at?: string;
  @IsOptional() @IsDateString() effective_at?: string;
  @IsOptional() @IsDateString() expired_at?: string;
  @IsOptional() @IsString() @MaxLength(300) effective_note?: string;
  @IsOptional() @IsDateString() last_verified_at?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) review_cycle_days?: number;
  @IsOptional() @Matches(/^\d+$/) replacement_regulation_id?: string;
  @IsString() @MinLength(1) @MaxLength(1000) summary!: string;
  @IsString() @MinLength(1) @MaxLength(REGULATION_LIMITS.content) content!: string;
  @IsString() @MinLength(2) @MaxLength(500) change_note!: string;
}

export class UpdateRegulationDraftDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) document_no?: string | null;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) document_no_empty_reason?: string | null;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) issuer?: string;
  @IsOptional() @IsIn(AUTHORITY_LEVELS) authority_level?: string;
  @IsOptional() @IsIn(REGULATION_CATEGORIES) category?: string;
  @IsOptional() @IsIn(REGULATION_SCOPES) scope?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REGULATION_LIMITS.regions)
  @ValidateNested({ each: true })
  @Type(() => RegulationRegionDto)
  regions?: RegulationRegionDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REGULATION_LIMITS.tags)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(1000)
  source_url?: string;
  @IsOptional() @IsDateString() published_at?: string;
  @IsOptional() @IsDateString() effective_at?: string;
  @IsOptional() @IsDateString() expired_at?: string;
  @IsOptional() @IsString() @MaxLength(300) effective_note?: string;
  @IsOptional() @IsDateString() last_verified_at?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) review_cycle_days?: number;
  @IsOptional() @Matches(/^\d+$/) replacement_regulation_id?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) summary?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(REGULATION_LIMITS.content) content?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) change_note?: string;
}

export class WorkflowReasonDto {
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class BatchRegulationWorkflowDto extends WorkflowReasonDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[1-9]\d*$/, { each: true })
  ids!: string[];
}

export class ExpireRegulationDto extends WorkflowReasonDto {
  @IsOptional() @IsDateString() expired_at?: string;
  @IsOptional() @Matches(/^\d+$/) replacement_regulation_id?: string;
}

export class AdminRegulationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsIn(Object.values(REGULATION_STATUS))
  status?: number;
  @IsOptional() @IsIn(REGULATION_CATEGORIES) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}

export class AdminQueueQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) status?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
