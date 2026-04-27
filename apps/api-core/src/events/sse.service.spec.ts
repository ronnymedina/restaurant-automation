import { Test, TestingModule } from '@nestjs/testing';
import { Subject } from 'rxjs';
import { SseService } from './sse.service';

describe('SseService', () => {
  let service: SseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SseService],
    }).compile();

    service = module.get<SseService>(SseService);
  });

  describe('emitToRestaurant', () => {
    it('emits to restaurant$ subject', (done) => {
      const restaurantId = 'r1';
      const event = 'order:new';
      const data = { orderId: 'o1' };

      service.streamForRestaurant(restaurantId).subscribe((msg) => {
        expect(msg.type).toBe(event);
        expect(msg.data).toEqual({});
        done();
      });

      service.emitToRestaurant(restaurantId, event, data);
    });
  });

  describe('emitToKitchen', () => {
    it('emits to kitchen$ subject', (done) => {
      const restaurantId = 'r1';
      const event = 'order:new';
      const data = { orderId: 'o1' };

      service.streamForKitchen(restaurantId).subscribe((msg) => {
        expect(msg.type).toBe(event);
        expect(msg.data).toEqual({});
        done();
      });

      service.emitToKitchen(restaurantId, event, data);
    });
  });

  describe('streamForRestaurant', () => {
    it('filters events by restaurantId', (done) => {
      const restaurantId = 'r1';
      const otherRestaurantId = 'r2';
      const event = 'order:new';
      const events: (string | undefined)[] = [];

      service.streamForRestaurant(restaurantId).subscribe((msg) => {
        events.push(msg.type);
        if (events.length === 1) {
          expect(events).toEqual([event]);
          done();
        }
      });

      service.emitToRestaurant(otherRestaurantId, 'order:updated', {});
      service.emitToRestaurant(restaurantId, event, {});
    });

    it('emits only matching restaurantId events', (done) => {
      const restaurantId = 'r1';
      const events: (string | undefined)[] = [];
      let count = 0;

      service.streamForRestaurant(restaurantId).subscribe((msg) => {
        events.push(msg.type);
        count++;
        if (count === 2) {
          expect(events).toEqual(['order:new', 'order:updated']);
          done();
        }
      });

      service.emitToRestaurant(restaurantId, 'order:new', {});
      service.emitToRestaurant('r2', 'order:deleted', {});
      service.emitToRestaurant(restaurantId, 'order:updated', {});
    });
  });

  describe('streamForKitchen', () => {
    it('filters events by restaurantId', (done) => {
      const restaurantId = 'r1';
      const otherRestaurantId = 'r2';
      const event = 'order:new';
      const events: (string | undefined)[] = [];

      service.streamForKitchen(restaurantId).subscribe((msg) => {
        events.push(msg.type);
        if (events.length === 1) {
          expect(events).toEqual([event]);
          done();
        }
      });

      service.emitToKitchen(otherRestaurantId, 'order:updated', {});
      service.emitToKitchen(restaurantId, event, {});
    });

    it('emits only matching restaurantId events', (done) => {
      const restaurantId = 'r1';
      const events: (string | undefined)[] = [];
      let count = 0;

      service.streamForKitchen(restaurantId).subscribe((msg) => {
        events.push(msg.type);
        count++;
        if (count === 2) {
          expect(events).toEqual(['order:new', 'order:updated']);
          done();
        }
      });

      service.emitToKitchen(restaurantId, 'order:new', {});
      service.emitToKitchen('r2', 'order:deleted', {});
      service.emitToKitchen(restaurantId, 'order:updated', {});
    });
  });
});
