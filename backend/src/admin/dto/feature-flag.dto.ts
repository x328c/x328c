import { IsBoolean, IsString, Length } from 'class-validator';

export class UpdateFeatureFlagsDto {
  @IsBoolean()
  route_enabled!: boolean;

  @IsBoolean()
  regulation_enabled!: boolean;

  @IsBoolean()
  route_link_enabled!: boolean;

  @IsBoolean()
  route_comment_enabled!: boolean;

  @IsBoolean()
  route_comment_read_enabled!: boolean;

  @IsBoolean()
  safety_guide_enabled!: boolean;

  @IsBoolean()
  safety_agreement_enforced!: boolean;

  @IsString()
  @Length(2, 500)
  reason!: string;
}
