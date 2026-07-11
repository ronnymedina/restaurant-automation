import { Test, TestingModule } from '@nestjs/testing';
import { KioskEventsService } from './kiosk.events';
import { SseService } from './sse.service';

const mockSseService = {
  emitToRestaurant: jest.fn(),
  emitToKitchen: jest.fn(),
};

describe('KioskEventsService', () => {
  let service: KioskEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KioskEventsService,
        { provide: SseService, useValue: mockSseService },
      ],
    }).compile();

    service = module.get<KioskEventsService>(KioskEventsService);
    jest.clearAllMocks();
  });

  describe('emitCatalogChanged', () => {
    it('can be called without throwing', () => {
      expect(() => service.emitCatalogChanged('r1')).not.toThrow();
    });
  });
});
