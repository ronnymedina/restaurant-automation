import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';

const mockStorageProvider = {
  save: jest.fn(),
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: STORAGE_PROVIDER, useValue: mockStorageProvider },
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

      const file = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.png$/);
    });

    it('should use .webp extension for image/webp', async () => {
      mockStorageProvider.save.mockResolvedValue('/uploads/products/some-uuid.webp');

      const file = {
        originalname: 'photo.webp',
        mimetype: 'image/webp',
        buffer: Buffer.alloc(512),
        size: 512,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      const [, filename] = mockStorageProvider.save.mock.calls[0];
      expect(filename).toMatch(/\.webp$/);
    });
  });
});
