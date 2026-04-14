import { InternalServerErrorException } from '@nestjs/common';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => input),
}));

// Set required env vars before importing the provider
process.env.CF_R2_ACCOUNT_ID        = 'test-account';
process.env.CF_R2_ACCESS_KEY_ID     = 'test-key';
process.env.CF_R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.CF_R2_BUCKET_NAME       = 'test-bucket';
process.env.CF_R2_PUBLIC_URL        = 'https://pub.example.com';

import { R2StorageProvider } from './r2-storage.provider';

describe('R2StorageProvider', () => {
  let provider: R2StorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new R2StorageProvider();
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

  it('should throw InternalServerErrorException when S3 send fails', async () => {
    mockSend.mockRejectedValue(new Error('S3 error'));
    await expect(provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg'))
      .rejects.toThrow(InternalServerErrorException);
  });
});
