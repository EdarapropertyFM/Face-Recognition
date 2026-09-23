import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  @MinLength(2)
  code: string;

  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  name: string[];

  @IsInt()
  @Min(0)
  @Max(10000)
  units: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  unitCodes?: string[];

  @IsInt()
  @Min(0)
  @IsOptional()
  cams?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  enrolled?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  strangersToday?: number;
}
