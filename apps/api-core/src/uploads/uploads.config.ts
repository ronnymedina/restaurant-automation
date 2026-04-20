import { registerAs } from '@nestjs/config';
import {
  UPLOAD_STORAGE,
  UPLOADS_PATH,
  UPLOAD_CF_R2_ACCOUNT_ID,
  UPLOAD_CF_R2_ACCESS_KEY_ID,
  UPLOAD_CF_R2_SECRET_ACCESS_KEY,
  UPLOAD_CF_R2_BUCKET_NAME,
  UPLOAD_CF_R2_PUBLIC_URL,
  UPLOAD_PRESIGN_EXPIRY_SECONDS,
  API_BASE_URL,
  JWT_SECRET,
} from '../config';

export const uploadsConfig = registerAs('uploads', () => ({
  uploadStorage: UPLOAD_STORAGE,
  uploadsPath: UPLOADS_PATH,
  cfR2AccountId: UPLOAD_CF_R2_ACCOUNT_ID,
  cfR2AccessKeyId: UPLOAD_CF_R2_ACCESS_KEY_ID,
  cfR2SecretAccessKey: UPLOAD_CF_R2_SECRET_ACCESS_KEY,
  cfR2BucketName: UPLOAD_CF_R2_BUCKET_NAME,
  cfR2PublicUrl: UPLOAD_CF_R2_PUBLIC_URL,
  presignExpirySeconds: UPLOAD_PRESIGN_EXPIRY_SECONDS,
  apiBaseUrl: API_BASE_URL,
  jwtSecret: JWT_SECRET,
}));
