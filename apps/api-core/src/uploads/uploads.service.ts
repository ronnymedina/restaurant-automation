import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import type { ConfigType } from '@nestjs/config';
import { STORAGE_PROVIDER, type StorageProvider, type PresignedUploadResult } from './providers/storage-provider.interface';
import { uploadsConfig } from './uploads.config';
import { UnsupportedMimetypeException, InvalidUploadTokenException } from './exceptions/uploads.exceptions';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const ALLOWED_MIMETYPES = Object.keys(MIME_TO_EXT);

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(uploadsConfig.KEY) private readonly config: ConfigType<typeof uploadsConfig>,
  ) {}

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    const ext = MIME_TO_EXT[file.mimetype] ?? '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    return this.storageProvider.save(file.buffer, filename, file.mimetype);
  }

  async getPresignedUpload(restaurantId: string, mimetype: string): Promise<PresignedUploadResult> {
    if (!ALLOWED_MIMETYPES.includes(mimetype)) {
      throw new UnsupportedMimetypeException(mimetype);
    }
    const ext = MIME_TO_EXT[mimetype];
    const key = `restaurants/${restaurantId}/${crypto.randomUUID()}${ext}`;
    return this.storageProvider.getPresignedUpload(key, mimetype, this.config.presignExpirySeconds);
  }

  async saveLocalPut(token: string, buffer: Buffer): Promise<void> {
    let payload: { key: string; publicUrl: string };
    try {
      payload = jwt.verify(token, this.config.jwtSecret) as { key: string; publicUrl: string };
    } catch {
      throw new InvalidUploadTokenException();
    }

    const filePath = path.join(this.config.uploadsPath, payload.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }
}
