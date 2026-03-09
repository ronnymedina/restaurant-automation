import { Test, TestingModule } from '@nestjs/testing';
import { KioskEventsService, KIOSK_EVENTS } from './kiosk.events';
import { EventsGateway } from './events.gateway';

const mockGateway = {
  emitToKiosk: jest.fn(),
};

describe('KioskEventsService', () => {
  let service: KioskEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KioskEventsService,
        { provide: EventsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<KioskEventsService>(KioskEventsService);
    jest.clearAllMocks();
  });

  describe('emitCatalogChanged', () => {
    it('emits catalog:changed event to kiosk room', () => {
      service.emitCatalogChanged('r1');
      expect(mockGateway.emitToKiosk).toHaveBeenCalledWith('r1', KIOSK_EVENTS.CATALOG_CHANGED, {});
    });
  });
});
