import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { RTSP_BRANDS } from '../rtsp-url';

/** Add every channel of a DVR as its own camera in one action. */
export class ImportDvrDto {
  @IsString() @MaxLength(255)
  host: string;

  @IsOptional() @IsInt() @Min(1) @Max(65535)
  port?: number;

  @IsString() @MaxLength(128)
  username: string;

  @IsString() @MaxLength(128)
  password: string;

  @IsIn(RTSP_BRANDS)
  brand: string;

  /** How many channels the recorder has; one camera is created per channel. */
  @IsInt() @Min(1) @Max(64)
  channels: number;

  @IsOptional() @IsIn(['main', 'sub'])
  stream?: string;

  @IsOptional() @IsString() @MaxLength(512)
  urlTemplate?: string;

  /** Camera ids become `${idPrefix}-CH1`, `${idPrefix}-CH2`, ... */
  @IsString() @MinLength(2) @MaxLength(48)
  idPrefix: string;

  /** Display names become `${displayName} CH1`, ... */
  @IsOptional() @IsString() @MaxLength(80)
  displayName?: string;

  @IsOptional() @IsInt() @Min(0)
  zone?: number;

  @IsOptional() @IsString() @MaxLength(64)
  buildingCode?: string;

  @IsOptional() @IsString() @MaxLength(160)
  location?: string;

  /**
   * Test each channel before creating it and skip the ones that do not
   * answer. Off by default: a recorder with empty slots would otherwise
   * silently import nothing, and probing is slow on a large DVR.
   */
  @IsOptional() @IsBoolean()
  probe?: boolean;
}
