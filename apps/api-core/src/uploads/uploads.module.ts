// apps/api-core/src/uploads/uploads.module.ts
import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { R2StorageProvider } from './providers/r2-storage.provider';
import {
  UPLOAD_STORAGE,
  CF_R2_ACCOUNT_ID,
  CF_R2_ACCESS_KEY_ID,
  CF_R2_SECRET_ACCESS_KEY,
  CF_R2_BUCKET_NAME,
  CF_R2_PUBLIC_URL,
} from '../config';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: () => {
        if (UPLOAD_STORAGE === 'r2') {
          const missing = [
            ['CF_R2_ACCOUNT_ID', CF_R2_ACCOUNT_ID],
            ['CF_R2_ACCESS_KEY_ID', CF_R2_ACCESS_KEY_ID],
            ['CF_R2_SECRET_ACCESS_KEY', CF_R2_SECRET_ACCESS_KEY],
            ['CF_R2_BUCKET_NAME', CF_R2_BUCKET_NAME],
            ['CF_R2_PUBLIC_URL', CF_R2_PUBLIC_URL],
          ]
            .filter(([, v]) => !v)
            .map(([k]) => k);

          if (missing.length > 0) {
            throw new Error(
              `Missing required R2 environment variables: ${missing.join(', ')}`,
            );
          }
          return new R2StorageProvider();
        }
        return new LocalStorageProvider();
      },
    },
  ],
})
export class UploadsModule {}
