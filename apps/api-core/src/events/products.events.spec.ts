import { Test, TestingModule } from '@nestjs/testing';
import { ProductEventsService, PRODUCT_EVENTS, CATEGORY_EVENTS } from './products.events';
import { EventsGateway } from './events.gateway';

const mockGateway = {
  emitToKiosk: jest.fn(),
};

describe('ProductEventsService', () => {
  let service: ProductEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductEventsService,
        { provide: EventsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<ProductEventsService>(ProductEventsService);
    jest.clearAllMocks();
  });

  describe('emitProductCreated', () => {
    it('emits catalog:changed event with product created payload', () => {
      service.emitProductCreated('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', PRODUCT_EVENTS.CATALOG_CHANGED, {
        type: 'product',
        action: 'created',
      });
    });
  });

  describe('emitProductUpdated', () => {
    it('emits catalog:changed event with product updated payload', () => {
      service.emitProductUpdated('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', PRODUCT_EVENTS.CATALOG_CHANGED, {
        type: 'product',
        action: 'updated',
      });
    });
  });

  describe('emitProductDeleted', () => {
    it('emits catalog:changed event with product deleted payload', () => {
      service.emitProductDeleted('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', PRODUCT_EVENTS.CATALOG_CHANGED, {
        type: 'product',
        action: 'deleted',
      });
    });
  });

  describe('emitCategoryCreated', () => {
    it('emits catalog:changed event with category created payload', () => {
      service.emitCategoryCreated('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', CATEGORY_EVENTS.CATALOG_CHANGED, {
        type: 'category',
        action: 'created',
      });
    });
  });

  describe('emitCategoryUpdated', () => {
    it('emits catalog:changed event with category updated payload', () => {
      service.emitCategoryUpdated('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', CATEGORY_EVENTS.CATALOG_CHANGED, {
        type: 'category',
        action: 'updated',
      });
    });
  });

  describe('emitCategoryDeleted', () => {
    it('emits catalog:changed event with category deleted payload', () => {
      service.emitCategoryDeleted('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', CATEGORY_EVENTS.CATALOG_CHANGED, {
        type: 'category',
        action: 'deleted',
      });
    });
  });
});
