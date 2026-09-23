import { IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDetectionDto {
  @IsOptional() @IsString() face?: string;
  @IsOptional() @IsString() aiPersonId?: string;
  @IsString() @IsNotEmpty() cam: string;
  @IsInt() @Min(0) zone: number;
  @IsNumber() @Min(0) @Max(100) conf: number;
  @IsString() @IsNotEmpty() type: string;
  @IsOptional() @IsString() decision?: string;
  @IsOptional() @IsNumber() similarity?: number;
  @IsOptional() @IsObject() quality?: Record<string, unknown>;
  @IsOptional() @IsString() when?: string;
}
