import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Camera } from '../cameras/entities/camera.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Face } from '../faces/entities/face.entity';
import { Building } from '../buildings/entities/building.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';

@Module({ imports: [TypeOrmModule.forFeature([Camera, Alert, Incident, Face, Building, Enrollment])], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
