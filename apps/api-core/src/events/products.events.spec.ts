import { Test, TestingModule } from '@nestjs/testing';
import { ProductEventsService } from './products.events';
import { SseService } from './sse.service';

const mockSseService = {
  emitToRestaurant: jest.fn(),
  emitToKitchen: jest.fn(),
};

describe('ProductEventsService', () => {
  let service: ProductEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductEventsService,
        { provide: SseService, useValue: mockSseService },
      ],
    }).compile();

    service = module.get<ProductEventsService>(ProductEventsService);
    jest.clearAllMocks();
  });

  describe('emitProductCreated', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitProductCreated('r1')).not.toThrow();
    });
  });

  describe('emitProductUpdated', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitProductUpdated('r1')).not.toThrow();
    });
  });

  describe('emitProductDeleted', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitProductDeleted('r1')).not.toThrow();
    });
  });

  describe('emitCategoryCreated', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitCategoryCreated('r1')).not.toThrow();
    });
  });

  describe('emitCategoryUpdated', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitCategoryUpdated('r1')).not.toThrow();
    });
  });

  describe('emitCategoryDeleted', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitCategoryDeleted('r1')).not.toThrow();
    });
  });
});
