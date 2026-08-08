import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class TaskFailureQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
  @Type(() => Number) @IsInt() @Min(0) @Max(1) status = 0;
}

export class TaskFailureNoteDto {
  @IsString() @Length(2, 500) note!: string;
}
