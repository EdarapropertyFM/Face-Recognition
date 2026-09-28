import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsService } from './units.service';
import { UnitsController } from './units.controller';
import { BuildingSetting } from './entities/building-setting.entity';
import { Project } from './entities/project.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { Detection } from '../detections/entities/detection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BuildingSetting, Project, Camera, Enrollment, Face, Detection])],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
