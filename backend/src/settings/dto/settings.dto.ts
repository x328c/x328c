import { IsBoolean, IsIn } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsIn(['public', 'participants', 'private'])
  profile_visibility!: 'public' | 'participants' | 'private';
  @IsBoolean() contact_visible!: boolean;
  @IsBoolean() ride_notifications!: boolean;
  @IsBoolean() activity_notifications!: boolean;
  @IsBoolean() system_notifications!: boolean;
}
