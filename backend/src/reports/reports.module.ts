import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Detection } from '../detections/entities/detection.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Face } from '../faces/entities/face.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Detection, Alert, Camera, Face, Enrollment])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
