import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { uploadsConfig } from './uploads.config';
import { UnsupportedMimetypeException } from './exceptions/uploads.exceptions';
import * as fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

const mockStorageProvider = {
  save: jest.fn(),
  getPresignedUpload: jest.fn(),
};

const mockConfig = {
  uploadStorage: 'local',
  uploadsPath: '/tmp/uploads',
  presignExpirySeconds: 120,
  jwtSecret: 'test-secret',
  apiBaseUrl: 'http://localhost:3000',
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
        { provide: uploadsConfig.KEY, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('saveProductImage', () => {
    it('should return the URL from the storage provider', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/abc.jpg');
      const file = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024),
        size: 1024,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(url).toBe('/uploads/products/abc.jpg');
    });

    it('should call provider.save with a UUID filename and correct mimetype', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.jpg');
      const file = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(mockStorageProvider.save).toHaveBeenCalledWith(
        file.buffer,
        expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/),
        'image/jpeg',
      );
    });

    it('should use .png extension for image/png', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.png');
      const file = { originalname: 'photo.png', mimetype: 'image/png', buffer: Buffer.alloc(512), size: 512 } as Express.Multer.File;
      await service.saveProductImage(file);
      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.webp');
      const file = { originalname: 'photo.webp', mimetype: 'image/webp', buffer: Buffer.alloc(512), size: 512 } as Express.Multer.File;
      await service.saveProductImage(file);
      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.webp$/);
    });
  });

  describe('getPresignedUpload', () => {
    it('should return presignedUrl and publicUrl from provider', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://example.com/signed',
        publicUrl: '/uploads/restaurants/rest-id/uuid.jpg',
      });

      const result = await service.getPresignedUpload('rest-id', 'image/jpeg');

      expect(result.presignedUrl).toBe('https://example.com/signed');
      expect(result.publicUrl).toBe('/uploads/restaurants/rest-id/uuid.jpg');
    });

    it('should call provider.getPresignedUpload with key restaurants/{restaurantId}/{uuid}.ext', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://example.com/signed',
        publicUrl: '/uploads/restaurants/rest-id/uuid.jpg',
      });

      await service.getPresignedUpload('rest-id', 'image/jpeg');

      const [key, mimetype, expiry] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/^restaurants\/rest-id\/[0-9a-f-]{36}\.jpg$/);
      expect(mimetype).toBe('image/jpeg');
      expect(expiry).toBe(120);
    });

    it('should use .png extension for image/png mimetype', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({ presignedUrl: '', publicUrl: '' });
      await service.getPresignedUpload('rest-id', 'image/png');
      const [key] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp mimetype', async () => {
      mockStorageProvider.getPresignedUpload.mockResolvedValue({ presignedUrl: '', publicUrl: '' });
      await service.getPresignedUpload('rest-id', 'image/webp');
      const [key] = mockStorageProvider.getPresignedUpload.mock.calls[0];
      expect(key).toMatch(/\.webp$/);
    });

    it('should throw UnsupportedMimetypeException for unsupported types', async () => {
      await expect(service.getPresignedUpload('rest-id', 'application/pdf'))
        .rejects.toThrow(UnsupportedMimetypeException);
    });
  });

  describe('saveLocalPut', () => {
    it('should write the buffer to disk at path derived from token', async () => {
      // Create a valid token to simulate what LocalStorageProvider produces
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { key: 'restaurants/rest-id/uuid.jpg', publicUrl: '/uploads/restaurants/rest-id/uuid.jpg' },
        'test-secret',
        { expiresIn: 120 },
      );

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await service.saveLocalPut(token, Buffer.from('img-bytes'));

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('restaurants/rest-id/uuid.jpg'),
        Buffer.from('img-bytes'),
      );
    });

    it('should throw InvalidUploadTokenException for an expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.default.sign(
        { key: 'restaurants/rest-id/uuid.jpg', publicUrl: '/uploads/restaurants/rest-id/uuid.jpg' },
        'test-secret',
        { expiresIn: -1 },
      );
      const { InvalidUploadTokenException } = await import('./exceptions/uploads.exceptions');

      await expect(service.saveLocalPut(expiredToken, Buffer.from('img'))).rejects.toThrow(InvalidUploadTokenException);
    });

    it('should throw InvalidUploadTokenException for a tampered token', async () => {
      const { InvalidUploadTokenException } = await import('./exceptions/uploads.exceptions');

      await expect(service.saveLocalPut('not.a.valid.token', Buffer.from('img'))).rejects.toThrow(InvalidUploadTokenException);
    });
  });
});
