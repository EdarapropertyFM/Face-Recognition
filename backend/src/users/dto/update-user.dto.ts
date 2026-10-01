import { IsArray, ArrayMaxSize, ArrayMinSize, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLES, STATUSES } from './create-user.dto';

/**
 * Deliberately not PartialType(CreateUserDto): the username is the primary
 * key and is not editable, and a blanket partial would let one through.
 */
export class UpdateUserDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsString({ each: true })
  name?: string[];

  @IsOptional() @IsIn(ROLES)
  role?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: string;

  @IsOptional() @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' })
  password?: string;
}
