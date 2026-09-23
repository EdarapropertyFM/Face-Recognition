import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enrollment } from './entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { SecureStorageModule } from '../secure-storage/secure-storage.module';
import { RateLimitGuard } from '../common/rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Enrollment, Face]), AiGatewayModule, SecureStorageModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, RateLimitGuard],
})
export class EnrollmentsModule {}
