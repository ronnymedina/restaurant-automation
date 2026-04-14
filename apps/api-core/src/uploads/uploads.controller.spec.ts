import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

const mockUploadsService = {
  saveProductImage: jest.fn(),
};

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        { provide: UploadsService, useValue: mockUploadsService },
        Reflector,
      ],
    }).compile();
    controller = module.get<UploadsController>(UploadsController);
  });

  describe('uploadImage', () => {
    it('should return url from service', async () => {
      mockUploadsService.saveProductImage.mockResolvedValue('/uploads/products/abc.jpg');
      const file = { originalname: 'test.jpg', size: 1024, buffer: Buffer.from('') } as Express.Multer.File;
      const result = await controller.uploadImage(file);
      expect(result).toEqual({ url: '/uploads/products/abc.jpg' });
      expect(mockUploadsService.saveProductImage).toHaveBeenCalledWith(file);
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });
});
