import { Module } from '@nestjs/common';
import { DogDetectionService } from './dog-detection.service';
import { DogDetectionController } from './dog-detection.controller';

@Module({
  controllers: [DogDetectionController],
  providers: [DogDetectionService],
})
export class DogDetectionModule {}
