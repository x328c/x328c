import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOGIN_LEGAL_DOCUMENTS } from '../legal-documents.constants';

export class LoginLegalConsentDto {
  @IsBoolean()
  @Equals(true)
  accepted!: true;

  @IsString()
  @Equals(LOGIN_LEGAL_DOCUMENTS.bundleVersion)
  bundle_version!: string;

  @IsString()
  @Equals(LOGIN_LEGAL_DOCUMENTS.userAgreementHash)
  user_agreement_hash!: string;

  @IsString()
  @Equals(LOGIN_LEGAL_DOCUMENTS.privacyPolicyHash)
  privacy_policy_hash!: string;

  @IsString()
  @Equals(LOGIN_LEGAL_DOCUMENTS.safetyNoticeHash)
  safety_notice_hash!: string;
}

export class WxLoginDto {
  @IsString()
  @Length(1, 128)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar_url?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => LoginLegalConsentDto)
  legal_consent!: LoginLegalConsentDto;
}
