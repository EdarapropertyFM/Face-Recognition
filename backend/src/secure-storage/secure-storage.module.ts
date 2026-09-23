import { Module } from '@nestjs/common';
import { SecureStorageService } from './secure-storage.service';

@Module({ providers: [SecureStorageService], exports: [SecureStorageService] })
export class SecureStorageModule {}
