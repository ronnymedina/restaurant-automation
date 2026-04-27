import { Injectable } from '@nestjs/common';
import { SseService } from './sse.service';

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
  constructor(private readonly sseService: SseService) {}

  emitProductCreated(restaurantId: string): void {}

  emitProductUpdated(restaurantId: string): void {}

  emitProductDeleted(restaurantId: string): void {}

  emitCategoryCreated(restaurantId: string): void {}

  emitCategoryUpdated(restaurantId: string): void {}

  emitCategoryDeleted(restaurantId: string): void {}
}
