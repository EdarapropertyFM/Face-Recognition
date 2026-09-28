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
  /** Path of the saved face image, relative to the AI snapshot directory. */
  @IsOptional() @IsString() snapshot?: string;
  /** Face-derived stranger identity from the AI; preferred over the track id. */
  @IsOptional() @IsString() strangerKey?: string;
}
