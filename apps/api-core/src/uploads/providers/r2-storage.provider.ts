import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, PresignedUploadResult } from './storage-provider.interface';
import { ImageUploadFailedException } from '../exceptions/uploads.exceptions';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

@Injectable()
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async save(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: `products/${filename}`,
          Body: buffer,
          ContentType: mimetype,
        }),
      );
      return `${this.publicUrl}/products/${filename}`;
    } catch {
      throw new ImageUploadFailedException();
    }
  }

  async getPresignedUpload(key: string, mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimetype,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presignedUrl = await getSignedUrl(this.client as any, command as any, { expiresIn: expiresInSeconds });
      return { presignedUrl, publicUrl: `${this.publicUrl}/${key}` };
    } catch {
      throw new ImageUploadFailedException();
    }
  }
}
