import { OrderStatus } from '@prisma/client';
import { OrderStateMachine, STATUS_ORDER, KITCHEN_ALLOWED_TARGETS } from './order-state-machine';
import {
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';

describe('OrderStateMachine', () => {
  describe('constants', () => {
    it('STATUS_ORDER lists the lifecycle in canonical order', () => {
      expect(STATUS_ORDER).toEqual([
        OrderStatus.CREATED,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.SERVED,
        OrderStatus.COMPLETED,
      ]);
    });

    it('KITCHEN_ALLOWED_TARGETS limits kitchen to PROCESSING and SERVED', () => {
      expect(KITCHEN_ALLOWED_TARGETS).toEqual([OrderStatus.PROCESSING, OrderStatus.SERVED]);
    });
  });

  describe('assertCanAdvance — cashier', () => {
    it('allows CREATED → CONFIRMED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.CONFIRMED, 'cashier')).not.toThrow();
    });
    it('allows CONFIRMED → PROCESSING', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.PROCESSING, 'cashier')).not.toThrow();
    });
    it('allows PROCESSING → SERVED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.SERVED, 'cashier')).not.toThrow();
    });
    it('allows SERVED → COMPLETED (isPaid validation lives in assertCanComplete)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.SERVED, OrderStatus.COMPLETED, 'cashier')).not.toThrow();
    });
    it('rejects skipping a step (CREATED → PROCESSING)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.PROCESSING, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects retroceso (PROCESSING → CONFIRMED)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.CONFIRMED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects advancing from CANCELLED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CANCELLED, OrderStatus.CONFIRMED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects advancing from COMPLETED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.COMPLETED, OrderStatus.CANCELLED, 'cashier')).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanAdvance — kitchen', () => {
    it('allows CONFIRMED → PROCESSING', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.PROCESSING, 'kitchen')).not.toThrow();
    });
    it('allows PROCESSING → SERVED', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.PROCESSING, OrderStatus.SERVED, 'kitchen')).not.toThrow();
    });
    it('rejects CREATED → CONFIRMED (cashier-only)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CREATED, OrderStatus.CONFIRMED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects SERVED → COMPLETED (kitchen never completes)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.SERVED, OrderStatus.COMPLETED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
    it('rejects skipping a step (CONFIRMED → SERVED)', () => {
      expect(() => OrderStateMachine.assertCanAdvance(OrderStatus.CONFIRMED, OrderStatus.SERVED, 'kitchen')).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanComplete', () => {
    it('allows SERVED + isPaid', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.SERVED, true)).not.toThrow();
    });
    it('rejects SERVED + !isPaid with OrderNotPaidException', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.SERVED, false)).toThrow(OrderNotPaidException);
    });
    it('rejects PROCESSING (not at SERVED yet) with InvalidStatusTransitionException', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.PROCESSING, true)).toThrow(InvalidStatusTransitionException);
    });
    it('rejects already COMPLETED', () => {
      expect(() => OrderStateMachine.assertCanComplete(OrderStatus.COMPLETED, true)).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('assertCanCancel', () => {
    it.each([OrderStatus.CREATED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SERVED])(
      'allows cancel from %s when not paid',
      (status) => {
        expect(() => OrderStateMachine.assertCanCancel(status, false)).not.toThrow();
      },
    );
    it('rejects when already CANCELLED with OrderAlreadyCancelledException', () => {
      expect(() => OrderStateMachine.assertCanCancel(OrderStatus.CANCELLED, false)).toThrow(OrderAlreadyCancelledException);
    });
    it('rejects when COMPLETED with InvalidStatusTransitionException', () => {
      expect(() => OrderStateMachine.assertCanCancel(OrderStatus.COMPLETED, false)).toThrow(InvalidStatusTransitionException);
    });
    it.each([OrderStatus.CREATED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SERVED])(
      'rejects cancel from %s when isPaid with CannotCancelPaidOrderException',
      (status) => {
        expect(() => OrderStateMachine.assertCanCancel(status, true)).toThrow(CannotCancelPaidOrderException);
      },
    );
  });
});
