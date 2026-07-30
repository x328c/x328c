import { IsOptional, IsString, Length } from 'class-validator';
export class RegisterActivityDto {
  @IsOptional() @IsString() @Length(1, 50) real_name?: string;
  @IsOptional() @IsString() @Length(1, 50) phone?: string;
  @IsOptional() @IsString() @Length(1, 50) emergency_contact?: string;
  @IsOptional() @IsString() @Length(1, 200) remark?: string;
}
