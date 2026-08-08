import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ForumCursorQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @Length(1, 500) cursor?: string;
}

export class ForumPostListQueryDto extends ForumCursorQueryDto {
  @IsOptional() @IsNumberString({ no_symbols: true }) board_id?: string;
  @IsOptional() @IsIn(['latest', 'hot']) sort: 'latest' | 'hot' = 'latest';
}

export class CreateForumPostDto {
  @IsNumberString({ no_symbols: true }) board_id!: string;
  @IsString() @Length(5, 50) title!: string;
  @IsString() @Length(10, 3000) content!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @ArrayUnique()
  @IsNumberString({ no_symbols: true }, { each: true })
  image_ids: string[] = [];
}

export class UpdateForumPostDto {
  @IsOptional() @IsNumberString({ no_symbols: true }) board_id?: string;
  @IsOptional() @IsString() @Length(5, 50) title?: string;
  @IsOptional() @IsString() @Length(10, 3000) content?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @ArrayUnique()
  @IsNumberString({ no_symbols: true }, { each: true })
  image_ids?: string[];
}

export class CreateForumReplyDto {
  @IsString() @Length(1, 1000) content!: string;
}

export class ForumReasonDto {
  @IsString() @Length(2, 500) reason!: string;
}

export class AdminForumQueueQueryDto {
  @IsOptional() @IsIn(['pending', 'errors']) queue: 'pending' | 'errors' = 'pending';
  @IsOptional() @IsIn(['post', 'reply']) type?: 'post' | 'reply';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}

export class AdminForumReportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2) status?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}

export class CreateUserRestrictionDto {
  @IsOptional() @IsDateString() starts_at?: string;
  @IsDateString() ends_at!: string;
  @IsString() @Length(2, 500) reason!: string;
}

export class SetForumBoardStatusDto extends ForumReasonDto {
  @Type(() => Number) @IsInt() @IsIn([0, 1]) status!: number;
}

export class ForumAuditQueryDto {
  @IsOptional()
  @IsIn(['forum_post', 'forum_reply', 'forum_board', 'user_restriction', 'report'])
  object_type?: string;
  @IsOptional() @IsString() @Length(1, 64) object_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
