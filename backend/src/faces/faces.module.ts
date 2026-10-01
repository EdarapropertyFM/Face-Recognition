import { Module } from '@nestjs/common';
import { FacesService } from './faces.service';
import { FacesController } from './faces.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Face } from './entities/face.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Detection } from '../detections/entities/detection.entity';
import { Camera } from '../cameras/entities/camera.entity';
import { SecureStorageModule } from '../secure-storage/secure-storage.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([Face, Enrollment, Detection, Camera]), SecureStorageModule, AiGatewayModule],
  controllers: [FacesController],
  providers: [FacesService],
})
export class FacesModule {}
