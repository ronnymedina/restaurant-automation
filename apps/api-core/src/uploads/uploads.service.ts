import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { STORAGE_PROVIDER, StorageProvider } from './providers/storage-provider.interface';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    const ext = this.getExtension(file.mimetype);
    const filename = `${crypto.randomUUID()}${ext}`;
    return this.storageProvider.save(file.buffer, filename, file.mimetype);
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimetype] ?? '.jpg';
  }
}
