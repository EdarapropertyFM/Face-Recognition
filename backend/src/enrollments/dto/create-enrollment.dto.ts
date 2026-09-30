import {
  ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleDto } from './vehicle.dto';

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

  /** Owner of the unit, or a tenant renting it (tenants attach owner.rentalAgreement). */
  @IsOptional() @IsIn(['owner', 'tenant'])
  residentType?: 'owner' | 'tenant';

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

  @IsArray() @IsOptional() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => VehicleDto)
  cars?: VehicleDto[];

  /** Returned by POST /enrollments/face-capture when the photos were taken. */
  @IsString()
  @IsOptional()
  aiPersonId?: string;
}
