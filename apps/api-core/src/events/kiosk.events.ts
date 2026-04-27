import { Injectable } from '@nestjs/common';
import { SseService } from './sse.service';

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
  constructor(private readonly sseService: SseService) {}

  emitCatalogChanged(restaurantId: string): void {}
}
