import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateAlertDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @IsNotEmpty() face: string;
  @IsString() @IsNotEmpty() cam: string;
  @IsInt() @Min(0) zone: number;
  @IsInt() @Min(0) @Max(100) conf: number;
  @IsOptional() @IsString() when?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() log?: unknown[];
}
