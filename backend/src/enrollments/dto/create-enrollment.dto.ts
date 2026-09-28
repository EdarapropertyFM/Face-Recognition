import {
  ArrayMaxSize, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResidenceDto {
  @IsString() @IsNotEmpty()
  project: string;

  @IsString() @IsNotEmpty()
  building: string;

  @IsString() @IsNotEmpty()
  unit: string;
}

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

  /** Every unit this resident holds, including the primary one above. */
  @IsArray() @IsOptional() @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => ResidenceDto)
  residences?: ResidenceDto[];

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
