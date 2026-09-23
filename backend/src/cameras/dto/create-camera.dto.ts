import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCameraDto {
  @IsString() @MinLength(2) @MaxLength(64)
  id: string;

  @IsString() @MinLength(2) @MaxLength(120)
  displayName: string;

  @IsInt() @Min(0)
  zone: number;

  @IsOptional() @IsString() @MaxLength(64)
  buildingCode?: string;

  @IsOptional() @IsString() @MaxLength(160)
  location?: string;

  @IsString() @Matches(/^rtsps?:\/\//i, { message: 'rtspUrl must start with rtsp:// or rtsps://' })
  rtspUrl: string;

  @IsOptional() @IsIn(['h264', 'h265', 'unknown'])
  codec?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
