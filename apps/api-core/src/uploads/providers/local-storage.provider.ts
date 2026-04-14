import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly uploadsPath: string) {}

  async save(buffer: Buffer, filename: string, _mimetype: string): Promise<string> {
    const uploadsDir = path.join(this.uploadsPath, 'products');
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    return `/uploads/products/${filename}`;
  }
}
