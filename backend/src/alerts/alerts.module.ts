import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './entities/alert.entity';
import { Face } from '../faces/entities/face.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Detection } from '../detections/entities/detection.entity';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [TypeOrmModule.forFeature([Alert, Face, Camera, Detection]), SecurityModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
