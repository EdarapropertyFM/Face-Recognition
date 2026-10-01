import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export const ROLES = ['Admin', 'Supervisor', 'Operator', 'Investigator', 'Viewer'] as const;
export const STATUSES = ['active', 'disabled'] as const;

export class CreateUserDto {
  /** Login name. Lowercase and punctuation-free so it cannot collide by case. */
  @IsString()
  @Matches(/^[a-z0-9._-]{3,32}$/, {
    message: 'Username must be 3-32 characters: lowercase letters, digits, dot, underscore or hyphen',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  u: string;

  /** [English, Arabic]. The Arabic entry falls back to the English one. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsString({ each: true })
  name: string[];

  @IsIn(ROLES)
  role: string;

  @IsOptional() @IsIn(STATUSES)
  status?: string;

  /**
   * Hashed by the service before it reaches the database. Eight characters
   * is the floor: these accounts can view every resident's biometric record.
   */
  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
