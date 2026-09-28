import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { User } from '../users/entities/user.entity';
import { Face } from '../faces/entities/face.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { BuildingSetting } from '../units/entities/building-setting.entity';
import { Project } from '../units/entities/project.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Detection } from '../detections/entities/detection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Face,
      Alert,
      Incident,
      Enrollment,
      BuildingSetting,
      Project,
      Camera,
      Setting,
      Detection,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
