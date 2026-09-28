import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  /** [English, Arabic] display name. */
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(120, { each: true })
  label?: string[];
}

export class UpdateProjectDto {
  /** Renaming cascades to every camera, enrolment and building that refers to it. */
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(120, { each: true })
  label?: string[];

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class CreateBuildingDto {
  @IsString() @MinLength(1) @MaxLength(64)
  code: string;

  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(120, { each: true })
  name?: string[];

  /** How many units the building has; generates codes like 4.6-C-01. */
  @IsOptional() @IsInt() @Min(0) @Max(10000)
  totalUnits?: number;

  /** Exact unit codes, for buildings that are not a plain 01..NN sequence. */
  @IsOptional() @IsArray() @ArrayMaxSize(10000) @IsString({ each: true }) @MaxLength(64, { each: true })
  unitCodes?: string[];
}
