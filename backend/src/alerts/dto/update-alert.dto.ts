import { PartialType } from '@nestjs/swagger';
import { CreateAlertDto } from './create-alert.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAlertDto extends PartialType(CreateAlertDto) {
  @IsOptional() @IsString() actor?: string;
}
