import { IsIn, IsMimeType, IsOptional } from 'class-validator';

export class UploadSignatureDto {
  @IsMimeType() @IsIn(['image/jpeg', 'image/png', 'image/webp']) file_type!: string;
  @IsOptional()
  @IsIn(['rides', 'activities', 'avatars', 'forum', 'route-comments', 'user-routes'])
  category?: 'rides' | 'activities' | 'avatars' | 'forum' | 'route-comments' | 'user-routes' =
    'rides';
}
