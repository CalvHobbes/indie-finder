import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import configuration from './config/configuration';
import { DogDetectionModule } from './dog-detection/dog-detection.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MulterModule.registerAsync({
      useFactory: () => ({
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB
        },
      }),
    }),
    DogDetectionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
