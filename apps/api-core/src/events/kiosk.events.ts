import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export const KIOSK_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

export const STOCK_STATUS = {
  AVAILABLE: 'available',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
} as const;

export type StockStatus = (typeof STOCK_STATUS)[keyof typeof STOCK_STATUS];

@Injectable()
export class KioskEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitCatalogChanged(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, KIOSK_EVENTS.CATALOG_CHANGED, {});
  }
}
