import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  CF_R2_ACCOUNT_ID,
  CF_R2_ACCESS_KEY_ID,
  CF_R2_SECRET_ACCESS_KEY,
  CF_R2_BUCKET_NAME,
  CF_R2_PUBLIC_URL,
} from '../../config';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: CF_R2_ACCESS_KEY_ID,
        secretAccessKey: CF_R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async save(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: CF_R2_BUCKET_NAME,
          Key: `products/${filename}`,
          Body: buffer,
          ContentType: mimetype,
        }),
      );
      return `${CF_R2_PUBLIC_URL}/products/${filename}`;
    } catch (_err) {
      throw new InternalServerErrorException('Error uploading image to storage');
    }
  }
}
