import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateBuildingSettingDto {
  /** [English, Arabic] display name. */
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsString({ each: true }) @MaxLength(120, { each: true })
  name?: string[];

  /** How many units the building really has; drives the coverage bar. */
  @IsOptional() @IsInt() @Min(0) @Max(10000)
  totalUnits?: number;

  /** Exact unit codes offered at enrolment. Empty = generate from totalUnits. */
  @IsOptional() @IsArray() @ArrayMaxSize(10000) @IsString({ each: true }) @MaxLength(64, { each: true })
  unitCodes?: string[];
}
