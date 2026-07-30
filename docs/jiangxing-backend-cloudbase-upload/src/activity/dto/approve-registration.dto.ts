import { IsIn, IsNumberString, IsOptional, IsString, Length } from 'class-validator';
export class ApproveRegistrationDto {
  @IsNumberString({ no_symbols: true }) user_id!: string;
  @IsIn(['approve', 'reject']) action!: 'approve' | 'reject';
  @IsOptional() @IsString() @Length(1, 200) reject_reason?: string;
}
