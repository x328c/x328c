import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DeleteRegulationDto {
  @Transform(trim)
  @IsString()
  @Length(2, 500)
  reason!: string;
}

export class BatchDeleteRegulationsDto extends DeleteRegulationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[1-9]\d*$/, { each: true })
  ids!: string[];
}
