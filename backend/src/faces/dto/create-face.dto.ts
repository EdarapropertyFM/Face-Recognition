import { IsString, IsArray, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateFaceDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsArray()
  @IsNotEmpty()
  name: string[];

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsArray()
  @IsNotEmpty()
  role: string[];

  @IsString()
  @IsOptional()
  idno?: string;

  @IsString()
  @IsOptional()
  issuer?: string;

  @IsString()
  @IsOptional()
  enroll?: string;

  @IsString()
  @IsOptional()
  img?: string;

  @IsString()
  @IsOptional()
  bldg?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  ban?: string;
}
