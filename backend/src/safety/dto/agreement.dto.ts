import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export const SAFETY_AGREEMENT_SCENES = [
  'ride_create',
  'ride_join',
] as const;
export type SafetyAgreementScene = (typeof SAFETY_AGREEMENT_SCENES)[number];

export class AgreementProofDto {
  @IsNumberString({ no_symbols: true }) @Length(1, 32) id!: string;
  @IsString() @Length(1, 32) version!: string;
  @IsString() @Length(64, 71) content_hash!: string;
}

export class OptionalAgreementDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AgreementProofDto)
  agreement?: AgreementProofDto;
}

export class ActiveAgreementQueryDto {
  @IsIn(SAFETY_AGREEMENT_SCENES)
  scene!: SafetyAgreementScene;
}

export class CreateSafetyAgreementDto {
  @IsString() @Length(1, 64) code!: string;
  @IsString() @Length(1, 32) version!: string;
  @IsString() @Length(1, 120) title!: string;
  @IsString() @Length(50, 50000) content!: string;
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SAFETY_AGREEMENT_SCENES, { each: true })
  scenes!: SafetyAgreementScene[];
  @IsDateString() effective_at!: string;
  @IsOptional() @IsDateString() expires_at?: string;
  @IsDateString() last_legal_reviewed_at!: string;
}

export class AgreementReasonDto {
  @IsString() @Length(2, 500) reason!: string;
}
