import { Module } from '@nestjs/common';
import { FacesService } from './faces.service';
import { FacesController } from './faces.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Face } from './entities/face.entity';
import { SecureStorageModule } from '../secure-storage/secure-storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Face]), SecureStorageModule],
  controllers: [FacesController],
  providers: [FacesService],
})
export class FacesModule {}
