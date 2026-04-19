const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
}));

import { R2StorageProvider } from './r2-storage.provider';
import { ImageUploadFailedException } from '../exceptions/uploads.exceptions';

const TEST_CONFIG = {
  accountId: 'test-account',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
  bucketName: 'test-bucket',
  publicUrl: 'https://pub.example.com',
};

describe('R2StorageProvider', () => {
  let provider: R2StorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new R2StorageProvider(TEST_CONFIG);
  });

  it('should return the public CDN URL after upload', async () => {
    mockSend.mockResolvedValue({});
    const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(url).toBe('https://pub.example.com/products/abc.jpg');
  });

  it('should call PutObjectCommand with correct params', async () => {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    mockSend.mockResolvedValue({});
    await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'products/abc.jpg',
      Body: Buffer.from('img'),
      ContentType: 'image/jpeg',
    });
  });

  it('should throw ImageUploadFailedException when S3 send fails', async () => {
    mockSend.mockRejectedValue(new Error('S3 error'));
    await expect(provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg'))
      .rejects.toThrow(ImageUploadFailedException);
  });

  describe('getPresignedUpload', () => {
    it('should return presignedUrl from getSignedUrl and publicUrl from config', async () => {
      mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');

      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );

      expect(result.presignedUrl).toBe('https://r2.example.com/signed-url');
      expect(result.publicUrl).toBe('https://pub.example.com/restaurants/abc/uuid.jpg');
    });

    it('should call getSignedUrl with PutObjectCommand using the key and content type', async () => {
      mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      await provider.getPresignedUpload('restaurants/abc/uuid.jpg', 'image/jpeg', 120);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'restaurants/abc/uuid.jpg',
        ContentType: 'image/jpeg',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 120 },
      );
    });

    it('should throw ImageUploadFailedException when getSignedUrl fails', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('network error'));

      await expect(
        provider.getPresignedUpload('restaurants/abc/uuid.jpg', 'image/jpeg', 120),
      ).rejects.toThrow(ImageUploadFailedException);
    });
  });
});
