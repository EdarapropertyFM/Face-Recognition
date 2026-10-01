import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  view?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  edit?: string[];
}
