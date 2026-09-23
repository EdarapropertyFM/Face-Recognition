import { PartialType } from '@nestjs/swagger';
import { CreateFaceDto } from './create-face.dto';

export class UpdateFaceDto extends PartialType(CreateFaceDto) {}
