import { join } from 'path';

import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum CacheDriver {
  Memory = 'memory',
  Redis = 'redis',
}

export enum UploadStorage {
  Local = 'local',
  R2 = 'r2',
}

class EnvironmentVariables {
  // --- required ---

  @IsEnum(Environment)
  @IsNotEmpty()
  NODE_ENV!: Environment;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_SECRET!: string;

  // --- app ---

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsOptional()
  @IsString()
  API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  // --- jwt ---

  @IsNotEmpty()
  @IsString()
  JWT_ACCESS_EXPIRATION!: string;

  @IsNotEmpty()
  @IsString()
  JWT_REFRESH_EXPIRATION!: string;

  // --- pagination / products ---

  @IsOptional()
  @IsNumber()
  @Min(1)
  DEFAULT_PAGE_SIZE?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  BATCH_SIZE?: number;

  @IsOptional()
  @IsString()
  PRODUCTS_DEFAULT_CATEGORY_NAME?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  PRODUCTS_MAX_PAGE_SIZE?: number;

  // --- users / email ---

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(10)
  @Max(15)
  BCRYPT_SALT_ROUNDS!: number;

  // --- kitchen ---

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  KITCHEN_TOKEN_EXPIRY_DAYS!: number;

  // --- cache ---

  @IsNotEmpty()
  @IsEnum(CacheDriver)
  CACHE_DRIVER!: CacheDriver;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // --- uploads ---

  @IsOptional()
  @IsEnum(UploadStorage)
  UPLOAD_STORAGE?: UploadStorage;

  @IsOptional()
  @IsNumber()
  @Min(1)
  UPLOAD_PRESIGN_EXPIRY_SECONDS?: number;

  @IsOptional()
  @IsString()
  UPLOADS_PATH?: string;

  // --- Cloudflare R2 (required when UPLOAD_STORAGE=r2) ---

  @IsOptional()
  @IsString()
  UPLOAD_CF_R2_ACCOUNT_ID?: string;

  @IsOptional()
  @IsString()
  UPLOAD_CF_R2_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  UPLOAD_CF_R2_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  UPLOAD_CF_R2_BUCKET_NAME?: string;

  @IsOptional()
  @IsString()
  UPLOAD_CF_R2_PUBLIC_URL?: string;

  // --- AI / onboarding ---

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_FILE_SIZE_MB?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_FILES?: number;

  // --- print ---

  @IsOptional()
  @IsBoolean()
  PRINT_CUSTOMER_ON_CREATE?: boolean;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

// app
export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL!;
export const NODE_ENV = process.env.NODE_ENV || 'production';
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';

// jwt auth
export const JWT_SECRET = process.env.JWT_SECRET!;
export const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m';
export const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';

// pagination
export const DEFAULT_PAGE_SIZE = Number(process.env.DEFAULT_PAGE_SIZE) || 10;

// products
export const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10;
export const PRODUCTS_DEFAULT_CATEGORY_NAME = process.env.PRODUCTS_DEFAULT_CATEGORY_NAME || 'default';
export const PRODUCTS_MAX_PAGE_SIZE = Number(process.env.PRODUCTS_MAX_PAGE_SIZE) || 50;

// users / email
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

// kitchen
export const KITCHEN_TOKEN_EXPIRY_DAYS = Number(process.env.KITCHEN_TOKEN_EXPIRY_DAYS) || 60;

// cache
export const CACHE_DRIVER = (process.env.CACHE_DRIVER || CacheDriver.Memory) as CacheDriver;
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// file paths — overridden by Electron in desktop mode
export const UPLOADS_PATH = process.env.UPLOADS_PATH ?? join(process.cwd(), 'uploads');
export const API_PUBLIC_PATH = process.env.API_PUBLIC_PATH ?? join(process.cwd(), 'public');

// uploads storage
export const UPLOAD_STORAGE = (process.env.UPLOAD_STORAGE || UploadStorage.Local) as UploadStorage;
export const UPLOAD_PRESIGN_EXPIRY_SECONDS = Number(process.env.UPLOAD_PRESIGN_EXPIRY_SECONDS) || 120;

// Cloudflare R2 — required only when UPLOAD_STORAGE=r2
export const UPLOAD_CF_R2_ACCOUNT_ID = process.env.UPLOAD_CF_R2_ACCOUNT_ID || '';
export const UPLOAD_CF_R2_ACCESS_KEY_ID = process.env.UPLOAD_CF_R2_ACCESS_KEY_ID || '';
export const UPLOAD_CF_R2_SECRET_ACCESS_KEY = process.env.UPLOAD_CF_R2_SECRET_ACCESS_KEY || '';
export const UPLOAD_CF_R2_BUCKET_NAME = process.env.UPLOAD_CF_R2_BUCKET_NAME || '';
export const UPLOAD_CF_R2_PUBLIC_URL = process.env.UPLOAD_CF_R2_PUBLIC_URL || '';

// AI / onboarding
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || '';

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 5;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FILES = Number(process.env.MAX_FILES) || 1;
export const MAX_ONBOARDING_PRODUCTS = Number(process.env.MAX_ONBOARDING_PRODUCTS) || 20;

// print
export const PRINT_CUSTOMER_ON_CREATE = process.env.PRINT_CUSTOMER_ON_CREATE === 'true';
