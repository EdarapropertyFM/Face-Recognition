import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateEnrollmentDto } from './create-enrollment.dto';

/**
 * `status` and `validationNote` are declared explicitly because the global
 * ValidationPipe runs with `whitelist: true`: a property no DTO declares is
 * stripped from the body before the controller sees it. Inheriting from
 * CreateEnrollmentDto alone is not enough — neither field exists there.
 */
export class UpdateEnrollmentDto extends PartialType(CreateEnrollmentDto) {
  @IsOptional()
  @IsIn(['pending', 'processing', 'approved', 'rejected', 'failed'])
  status?: string;

  /**
   * Why a registration was refused. Required when rejecting: the applicant is
   * told what to fix, and the decision stays accountable to whoever made it.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(3, { message: 'Give a reason for rejecting this registration' })
  @MaxLength(500, { message: 'Keep the rejection reason under 500 characters' })
  validationNote?: string;
}
