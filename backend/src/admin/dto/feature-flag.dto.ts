import { IsBoolean, IsIn, IsString, Length } from 'class-validator';

export class UpdateFeatureFlagsDto {
  @IsBoolean()
  route_enabled!: boolean;

  @IsBoolean()
  regulation_enabled!: boolean;

  @IsBoolean()
  forum_enabled!: boolean;

  @IsBoolean()
  forum_write_enabled!: boolean;

  @IsIn(['invite_only', 'gray', 'all'])
  forum_publish_mode!: 'invite_only' | 'gray' | 'all';

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
