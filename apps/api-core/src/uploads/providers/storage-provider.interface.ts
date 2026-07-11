export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface PresignedUploadResult {
  presignedUrl: string;
  publicUrl: string;
}

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
  getPresignedUpload(key: string, mimetype: string, expiresInSeconds: number): Promise<PresignedUploadResult>;
}
