import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  @IsOptional()
  ref?: string;

  @IsString()
  @IsOptional()
  schema?: string;

  @IsString()
  @IsNotEmpty()
  building: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsString()
  @IsOptional()
  submittedAt?: string;

  @IsObject()
  @IsNotEmpty()
  owner: Record<string, unknown>;

  @IsArray()
  @IsOptional()
  family?: Record<string, unknown>[];

  @IsArray()
  @IsOptional()
  cars?: Record<string, unknown>[];

  /** Returned by POST /enrollments/face-capture when the photos were taken. */
  @IsString()
  @IsOptional()
  aiPersonId?: string;
}
