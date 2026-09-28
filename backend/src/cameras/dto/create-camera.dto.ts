import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { RTSP_BRANDS } from '../rtsp-url';

export class CreateCameraDto {
  @IsString() @MinLength(2) @MaxLength(64)
  id: string;

  @IsString() @MinLength(2) @MaxLength(120)
  displayName: string;

  @IsInt() @Min(0)
  zone: number;

  @IsOptional() @IsString() @MaxLength(120)
  project?: string;

  @IsOptional() @IsString() @MaxLength(64)
  buildingCode?: string;

  @IsOptional() @IsString() @MaxLength(160)
  location?: string;

  // ---- Stream source: EITHER the connection details below, OR a raw rtspUrl.
  // The service rejects a camera that supplies neither, and prefers the
  // details when both are present.

  /** DVR/NVR/camera IP or hostname. */
  @IsOptional() @IsString() @MaxLength(255)
  host?: string;

  @IsOptional() @IsInt() @Min(1) @Max(65535)
  port?: number;

  @IsOptional() @IsString() @MaxLength(128)
  username?: string;

  @IsOptional() @IsString() @MaxLength(128)
  password?: string;

  @IsOptional() @IsIn(RTSP_BRANDS)
  brand?: string;

  /** DVR channel number; 1 for a standalone camera. */
  @IsOptional() @IsInt() @Min(1) @Max(64)
  channel?: number;

  /** 'sub' is lower resolution and much cheaper to decode; best for recognition. */
  @IsOptional() @IsIn(['main', 'sub'])
  stream?: string;

  /** Only for brand 'custom': {user} {pass} {host} {port} {ch} {sub}. */
  @IsOptional() @IsString() @MaxLength(512)
  urlTemplate?: string;

  /** Full RTSP URL, for a camera that is not one of the known brands. */
  @IsOptional() @IsString()
  @Matches(/^rtsps?:\/\//i, { message: 'rtspUrl must start with rtsp:// or rtsps://' })
  rtspUrl?: string;

  @IsOptional() @IsIn(['h264', 'h265', 'unknown'])
  codec?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
