import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RouteCommentListDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
export class CreateRouteCommentDto {
  @IsString() @Length(2, 500) content!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  images?: string[];
}
export class DeleteRouteCommentDto {
  @IsString() @Length(2, 500) reason!: string;
}
export class AdminRouteCommentQueryDto {
  @IsOptional() @IsIn(['asc', 'desc']) report_order?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
