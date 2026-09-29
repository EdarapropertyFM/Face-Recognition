import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsService } from './units.service';
import { UnitsController } from './units.controller';
import { BuildingSetting } from './entities/building-setting.entity';
import { Project } from './entities/project.entity';
import { UnitRecord } from './entities/unit-record.entity';
import { UnitRegistryService } from './unit-registry.service';
import { UnitRegistryController } from './unit-registry.controller';
import { Camera } from '../cameras/entities/camera.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { Detection } from '../detections/entities/detection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BuildingSetting, Project, UnitRecord, Camera, Enrollment, Face, Detection])],
  controllers: [UnitsController, UnitRegistryController],
  providers: [UnitsService, UnitRegistryService],
  exports: [UnitsService],
})
export class UnitsModule {}
