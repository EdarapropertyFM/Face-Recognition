import { Module } from '@nestjs/common';
import { DetectionsService } from './detections.service';
import { DetectionsController } from './detections.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Detection } from './entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Face } from '../faces/entities/face.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Detection, Alert, Setting, Face])],
  controllers: [DetectionsController],
  providers: [DetectionsService],
})
export class DetectionsModule {}
