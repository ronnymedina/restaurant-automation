import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export const PRODUCT_TYPES = {
  PRODUCT: 'product',
  CATEGORY: 'category',
} as const;

export const PRODUCT_ACTIONS = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
} as const;

export const PRODUCT_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

export const CATEGORY_EVENTS = {
  CATALOG_CHANGED: 'catalog:changed',
} as const;

@Injectable()
export class ProductEventsService {
  constructor(private readonly gateway: EventsGateway) { }

  emitProductCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.PRODUCT,
      action: PRODUCT_ACTIONS.CREATED,
    });
  }

  emitProductUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.PRODUCT,
      action: PRODUCT_ACTIONS.UPDATED,
    });
  }

  emitProductDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, PRODUCT_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.PRODUCT,
      action: PRODUCT_ACTIONS.DELETED,
    });
  }

  emitCategoryCreated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.CATEGORY,
      action: PRODUCT_ACTIONS.CREATED,
    });
  }

  emitCategoryUpdated(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.CATEGORY,
      action: PRODUCT_ACTIONS.UPDATED,
    });
  }

  emitCategoryDeleted(restaurantId: string): void {
    this.gateway.emitToKiosk(restaurantId, CATEGORY_EVENTS.CATALOG_CHANGED, {
      type: PRODUCT_TYPES.CATEGORY,
      action: PRODUCT_ACTIONS.DELETED,
    });
  }
}
