import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { SseService } from './sse.service';

describe('SseService', () => {
  let service: SseService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [SseService],
    }).compile();
    service = module.get<SseService>(SseService);
  });

  afterEach(() => module.close());

  describe('emitToRestaurant', () => {
    it('emits to restaurant$ subject', async () => {
      const promise = firstValueFrom(service.streamForRestaurant('r1'));
      service.emitToRestaurant('r1', 'order:new', { orderId: 'o1' });
      const msg = await promise;
      expect(msg.type).toBe('order:new');
      expect(msg.data).toEqual({});
    });
  });

  describe('emitToKitchen', () => {
    it('emits to kitchen$ subject', async () => {
      const promise = firstValueFrom(service.streamForKitchen('r1'));
      service.emitToKitchen('r1', 'order:new', { orderId: 'o1' });
      const msg = await promise;
      expect(msg.type).toBe('order:new');
      expect(msg.data).toEqual({});
    });
  });

  describe('streamForRestaurant', () => {
    it('filters out events for other restaurants', async () => {
      const promise = firstValueFrom(service.streamForRestaurant('r1'));
      service.emitToRestaurant('r2', 'order:updated', {});
      service.emitToRestaurant('r1', 'order:new', {});
      const msg = await promise;
      expect(msg.type).toBe('order:new');
    });

    it('emits all matching restaurantId events in order', async () => {
      const promise = firstValueFrom(service.streamForRestaurant('r1').pipe(take(2), toArray()));
      service.emitToRestaurant('r1', 'order:new', {});
      service.emitToRestaurant('r2', 'order:deleted', {});
      service.emitToRestaurant('r1', 'order:updated', {});
      const msgs = await promise;
      expect(msgs.map((m) => m.type)).toEqual(['order:new', 'order:updated']);
    });
  });

  describe('streamForKitchen', () => {
    it('filters out events for other restaurants', async () => {
      const promise = firstValueFrom(service.streamForKitchen('r1'));
      service.emitToKitchen('r2', 'order:updated', {});
      service.emitToKitchen('r1', 'order:new', {});
      const msg = await promise;
      expect(msg.type).toBe('order:new');
    });

    it('emits all matching restaurantId events in order', async () => {
      const promise = firstValueFrom(service.streamForKitchen('r1').pipe(take(2), toArray()));
      service.emitToKitchen('r1', 'order:new', {});
      service.emitToKitchen('r2', 'order:deleted', {});
      service.emitToKitchen('r1', 'order:updated', {});
      const msgs = await promise;
      expect(msgs.map((m) => m.type)).toEqual(['order:new', 'order:updated']);
    });
  });
});
