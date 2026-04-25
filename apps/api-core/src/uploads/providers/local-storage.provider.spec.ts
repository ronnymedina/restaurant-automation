import * as fs from 'fs/promises';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { LocalStorageProvider } from './local-storage.provider';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const TEST_UPLOADS_PATH = '/tmp/test-uploads';
const TEST_JWT_SECRET = 'test-secret';
const TEST_API_BASE_URL = 'http://localhost:3000';
const TEST_EXPIRY = 120;

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LocalStorageProvider(TEST_UPLOADS_PATH, TEST_JWT_SECRET, TEST_API_BASE_URL, TEST_EXPIRY);
  });

  describe('save', () => {
    it('should return a full URL for /uploads/products/', async () => {
      const url = await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      expect(url).toBe('http://localhost:3000/uploads/products/abc.jpg');
    });

    it('should write the file to the configured uploads/products directory', async () => {
      await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
      expect(writePath).toBe(path.join(TEST_UPLOADS_PATH, 'products', 'abc.jpg'));
    });

    it('should create the directory recursively', async () => {
      await provider.save(Buffer.from('img'), 'abc.jpg', 'image/jpeg');
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(TEST_UPLOADS_PATH, 'products'),
        { recursive: true },
      );
    });
  });

  describe('getPresignedUpload', () => {
    it('should return presignedUrl pointing to local-put endpoint with a token', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );

      expect(result.presignedUrl).toMatch(
        /^http:\/\/localhost:3000\/v1\/uploads\/local-put\/.+$/,
      );
    });

    it('should return publicUrl as a full URL for /uploads/{key}', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      expect(result.publicUrl).toBe('http://localhost:3000/uploads/restaurants/abc/uuid.jpg');
    });

    it('should embed key and publicUrl in the signed token', async () => {
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      const token = result.presignedUrl.split('/').pop()!;
      const payload = jwt.verify(token, TEST_JWT_SECRET) as { key: string; publicUrl: string };

      expect(payload.key).toBe('restaurants/abc/uuid.jpg');
      expect(payload.publicUrl).toBe('http://localhost:3000/uploads/restaurants/abc/uuid.jpg');
    });

    it('should sign the token with the configured expiry', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await provider.getPresignedUpload(
        'restaurants/abc/uuid.jpg',
        'image/jpeg',
        120,
      );
      const after = Math.floor(Date.now() / 1000);
      const token = result.presignedUrl.split('/').pop()!;
      const payload = jwt.verify(token, TEST_JWT_SECRET) as { exp: number };

      expect(payload.exp).toBeGreaterThanOrEqual(before + 120);
      expect(payload.exp).toBeLessThanOrEqual(after + 120);
    });
  });
});
