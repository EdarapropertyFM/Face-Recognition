import { Module } from '@nestjs/common';
import { DetectionsService } from './detections.service';
import { DetectionsController } from './detections.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Detection } from './entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Face } from '../faces/entities/face.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [TypeOrmModule.forFeature([Detection, Alert, Setting, Face, Camera]), SecurityModule],
  controllers: [DetectionsController],
  providers: [DetectionsService],
})
export class DetectionsModule {}
