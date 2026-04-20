import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import * as express from 'express';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import { uploadsConfig } from './uploads.config';

@Module({
  imports: [ConfigModule.forFeature(uploadsConfig)],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigType<typeof uploadsConfig>) => {
        if (config.uploadStorage === 'r2') {
          const missing = [
            ['CF_R2_ACCOUNT_ID', config.cfR2AccountId],
            ['CF_R2_ACCESS_KEY_ID', config.cfR2AccessKeyId],
            ['CF_R2_SECRET_ACCESS_KEY', config.cfR2SecretAccessKey],
            ['CF_R2_BUCKET_NAME', config.cfR2BucketName],
            ['CF_R2_PUBLIC_URL', config.cfR2PublicUrl],
          ]
            .filter(([, v]) => !v)
            .map(([k]) => k);

          if (missing.length > 0) {
            throw new Error(
              `Missing required R2 environment variables: ${missing.join(', ')}`,
            );
          }

          return new R2StorageProvider({
            accountId: config.cfR2AccountId,
            accessKeyId: config.cfR2AccessKeyId,
            secretAccessKey: config.cfR2SecretAccessKey,
            bucketName: config.cfR2BucketName,
            publicUrl: config.cfR2PublicUrl,
          });
        }
        return new LocalStorageProvider(
          config.uploadsPath,
          config.jwtSecret,
          config.apiBaseUrl,
          config.presignExpirySeconds,
        );
      },
      inject: [uploadsConfig.KEY],
    },
  ],
})
export class UploadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply express.raw() so PUT /local-put/:token receives binary body as Buffer.
    // Using the controller class ensures the versioned path (/v1/...) is matched correctly.
    consumer
      .apply(express.raw({ type: 'image/*', limit: '10mb' }))
      .forRoutes(UploadsController);
  }
}
