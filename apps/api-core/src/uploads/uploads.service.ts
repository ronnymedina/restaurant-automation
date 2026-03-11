import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';

const TEN_MB = 10 * 1024 * 1024;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'products');

@Injectable()
export class UploadsService {
  async saveProductImage(file: Express.Multer.File): Promise<string> {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const ext = this.getExtension(file.mimetype);
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const buffer =
      file.size > TEN_MB
        ? await this.compress(file.buffer, file.mimetype)
        : file.buffer;

    await fs.writeFile(filePath, buffer);

    return `/uploads/products/${filename}`;
  }

  private async compress(buffer: Buffer, mimetype: string): Promise<Buffer> {
    const pipeline = sharp(buffer).resize({ width: 1200, withoutEnlargement: true });

    if (mimetype === 'image/webp') {
      return pipeline.webp({ quality: 80 }).toBuffer();
    }
    return pipeline.jpeg({ quality: 80 }).toBuffer();
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.jpg', // convert PNG to JPEG for consistency
      'image/webp': '.webp',
    };
    return map[mimetype] ?? '.jpg';
  }
}
