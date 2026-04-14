export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimetype: string): Promise<string>;
}
