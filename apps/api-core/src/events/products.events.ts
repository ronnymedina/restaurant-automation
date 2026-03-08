import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export const PRODUCT_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

export const CATEGORY_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

@Injectable()
export class ProductEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitProductCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'created',
    });
  }

  emitProductUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'updated',
    });
  }

  emitProductDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: 'product',
      action: 'deleted',
    });
  }

  emitCategoryCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'created',
    });
  }

  emitCategoryUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'updated',
    });
  }

  emitCategoryDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: 'category',
      action: 'deleted',
    });
  }
}
