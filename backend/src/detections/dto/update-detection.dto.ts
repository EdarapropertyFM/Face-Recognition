import { PartialType } from '@nestjs/swagger';
import { CreateDetectionDto } from './create-detection.dto';

export class UpdateDetectionDto extends PartialType(CreateDetectionDto) {}
