import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

const mockUploadsService = {
  saveProductImage: jest.fn(),
  getPresignedUpload: jest.fn(),
  saveLocalPut: jest.fn(),
};

const mockUser = { restaurantId: 'rest-123', id: 'user-1', role: 'ADMIN' };

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
    });

    it('should throw BadRequestException when no file provided', async () => {
      await expect(controller.uploadImage(undefined as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('presign', () => {
    it('should return presignedUrl and publicUrl from service', async () => {
      mockUploadsService.getPresignedUpload.mockResolvedValue({
        presignedUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://cdn.example.com/restaurants/rest-123/uuid.jpg',
      });

      const result = await controller.presign(
        mockUser as any,
        { mimetype: 'image/jpeg' },
      );

      expect(result).toEqual({
        presignedUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://cdn.example.com/restaurants/rest-123/uuid.jpg',
      });
      expect(mockUploadsService.getPresignedUpload).toHaveBeenCalledWith('rest-123', 'image/jpeg');
    });
  });

  describe('localPut', () => {
    it('should call saveLocalPut and return 204', async () => {
      mockUploadsService.saveLocalPut.mockResolvedValue(undefined);

      await controller.localPut('some-token', Buffer.from('image data'), 'image/jpeg');

      expect(mockUploadsService.saveLocalPut).toHaveBeenCalledWith(
        'some-token',
        Buffer.from('image data'),
      );
    });
  });
});
