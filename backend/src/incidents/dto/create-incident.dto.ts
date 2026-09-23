import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIncidentDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() alertId?: string;
  @IsString() @IsNotEmpty() sef: string;
  @IsArray() @IsNotEmpty() title: string[];
  @IsOptional() @IsString() face?: string;
  @IsInt() zone: number;
  @IsOptional() @IsString() when?: string;
  @IsOptional() @IsArray() officer?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() desc?: string[];
  @IsOptional() @IsArray() att?: string[];
}
