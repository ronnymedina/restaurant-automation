import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { StorageProvider, PresignedUploadResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly uploadsPath: string,
    private readonly jwtSecret: string,
    private readonly apiBaseUrl: string,
    private readonly presignExpirySeconds: number,
  ) {}

  async save(buffer: Buffer, filename: string, _mimetype: string): Promise<string> {
    const uploadsDir = path.join(this.uploadsPath, 'products');
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    return `/uploads/products/${filename}`;
  }

  async getPresignedUpload(key: string, _mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult> {
    const publicUrl = `/uploads/${key}`;
    const token = jwt.sign({ key, publicUrl }, this.jwtSecret, { expiresIn: expiresInSeconds });
    const presignedUrl = `/v1/uploads/local-put/${token}`;
    return { presignedUrl, publicUrl };
  }
}
