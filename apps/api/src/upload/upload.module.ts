import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  controllers: [UploadController],
  exports: [StorageService],
})
export class UploadModule {}
