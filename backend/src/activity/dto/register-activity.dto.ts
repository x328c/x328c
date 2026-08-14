import { IsOptional, IsString, Length } from 'class-validator';
import { OptionalAgreementDto } from '../../safety/dto/agreement.dto';
export class RegisterActivityDto extends OptionalAgreementDto {
  @IsOptional() @IsString() @Length(1, 50) real_name?: string;
  @IsOptional() @IsString() @Length(1, 50) phone?: string;
  @IsOptional() @IsString() @Length(1, 50) emergency_contact?: string;
  @IsOptional() @IsString() @Length(1, 200) remark?: string;
}
