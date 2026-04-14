import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  async save(buffer: Buffer, filename: string, _mimetype: string): Promise<string> {
    // Read UPLOADS_PATH at call time (not module load time) so E2E tests
    // can override process.env.UPLOADS_PATH in beforeAll before bootstrap.
    const uploadsDir = path.join(
      process.env.UPLOADS_PATH ?? path.join(process.cwd(), 'uploads'),
      'products',
    );
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, filename), buffer);
    return `/uploads/products/${filename}`;
  }
}
