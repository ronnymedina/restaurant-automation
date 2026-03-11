import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock sharp
jest.mock('sharp', () => {
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('compressed')),
  };
  return jest.fn(() => mockInstance);
});

// Mock fs
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const TEN_MB = 10 * 1024 * 1024;

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadsService],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('saveProductImage', () => {
    it('should return a URL path after saving', async () => {
      const file: Express.Multer.File = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024), // 1KB — small, no compression
        size: 1024,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(url).toMatch(/^\/uploads\/products\/.+\.jpg$/);
    });

    it('should compress image when file is larger than 10MB', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'big-photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(TEN_MB + 1),
        size: TEN_MB + 1,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(sharp).toHaveBeenCalled();
      const instance = sharp.mock.results[0].value;
      expect(instance.resize).toHaveBeenCalledWith({ width: 1200, withoutEnlargement: true });
      expect(instance.jpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should NOT compress image when file is 10MB or smaller', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'small-photo.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(TEN_MB),
        size: TEN_MB,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(sharp).not.toHaveBeenCalled();
      expect(url).toMatch(/\.png$/);  // small PNG keeps .png extension
    });

    it('should give large PNG a .jpg extension after compression', async () => {
      const file: Express.Multer.File = {
        originalname: 'big-photo.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(TEN_MB + 1),
        size: TEN_MB + 1,
      } as Express.Multer.File;

      const url = await service.saveProductImage(file);

      expect(url).toMatch(/\.jpg$/);
    });

    it('should handle webp files', async () => {
      const sharp = require('sharp');
      const file: Express.Multer.File = {
        originalname: 'photo.webp',
        mimetype: 'image/webp',
        buffer: Buffer.alloc(TEN_MB + 1),
        size: TEN_MB + 1,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(sharp).toHaveBeenCalled();
      const instance = sharp.mock.results[0].value;
      expect(instance.webp).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should write the file to disk', async () => {
      const file: Express.Multer.File = {
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(1024),
        size: 1024,
      } as Express.Multer.File;

      await service.saveProductImage(file);

      expect(fs.writeFile).toHaveBeenCalled();
      const [writePath] = (fs.writeFile as jest.Mock).mock.calls[0];
      expect(writePath).toContain(path.join('uploads', 'products'));
    });
  });
});
