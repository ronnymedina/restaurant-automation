import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseEvent {
  restaurantId: string;
  event: string;
  data: unknown;
}

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly restaurant$ = new Subject<SseEvent>();
  private readonly kitchen$ = new Subject<SseEvent>();

  onModuleDestroy() {
    this.restaurant$.complete();
    this.kitchen$.complete();
  }

  emitToRestaurant(restaurantId: string, event: string, data: unknown): void {
    this.restaurant$.next({ restaurantId, event, data });
  }

  emitToKitchen(restaurantId: string, event: string, data: unknown): void {
    this.kitchen$.next({ restaurantId, event, data });
  }

  streamForRestaurant(restaurantId: string): Observable<MessageEvent> {
    return this.restaurant$.pipe(
      filter((evt) => evt.restaurantId === restaurantId),
      map((evt) => ({ type: evt.event, data: {} })),
    );
  }

  streamForKitchen(restaurantId: string): Observable<MessageEvent> {
    return this.kitchen$.pipe(
      filter((evt) => evt.restaurantId === restaurantId),
      map((evt) => ({ type: evt.event, data: {} })),
    );
  }
}
