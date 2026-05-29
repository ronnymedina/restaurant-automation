import { OrderStatus } from '@prisma/client';
import {
  InvalidStatusTransitionException,
  OrderAlreadyCancelledException,
  OrderNotPaidException,
  CannotCancelPaidOrderException,
} from './exceptions/orders.exceptions';

/**
 * Canonical order lifecycle sequence (excludes CANCELLED, which is a terminal side-exit).
 */
export const STATUS_ORDER: readonly OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SERVED,
  OrderStatus.COMPLETED,
] as const;

/**
 * The only statuses a kitchen actor may advance an order TO.
 * Kitchen handles prep and service; it never confirms nor completes.
 */
export const KITCHEN_ALLOWED_TARGETS: readonly OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.SERVED,
] as const;

export type Actor = 'cashier' | 'kitchen';

export class OrderStateMachine {
  static readonly STATUS_ORDER = STATUS_ORDER;
  static readonly KITCHEN_ALLOWED_TARGETS = KITCHEN_ALLOWED_TARGETS;

  /**
   * Validates a strict +1 step transition along STATUS_ORDER for the given actor.
   *
   * Rules:
   * - `from` must appear in STATUS_ORDER (CANCELLED is not in the list → always invalid as source).
   * - `to` must be exactly the next index (no skips, no backwards moves).
   * - For `actor === 'kitchen'`: `to` must additionally be in KITCHEN_ALLOWED_TARGETS.
   *   This means CREATED → CONFIRMED and SERVED → COMPLETED are cashier-only transitions.
   *
   * Note: SERVED → COMPLETED passes this method without an isPaid check.
   * Use `assertCanComplete` when the payment gate is also required.
   *
   * @throws InvalidStatusTransitionException if the transition is not allowed.
   */
  static assertCanAdvance(from: OrderStatus, to: OrderStatus, actor: Actor): void {
    const currentIdx = STATUS_ORDER.indexOf(from);
    const targetIdx = STATUS_ORDER.indexOf(to);

    if (currentIdx === -1 || targetIdx === -1 || targetIdx !== currentIdx + 1) {
      throw new InvalidStatusTransitionException(from, to);
    }

    if (actor === 'kitchen' && !KITCHEN_ALLOWED_TARGETS.includes(to)) {
      throw new InvalidStatusTransitionException(from, to);
    }
  }

  /**
   * Validates that the order can be closed (SERVED → COMPLETED) with the payment guarantee.
   *
   * This is the payment-gated version of the SERVED → COMPLETED step; only the cashier
   * actor ever calls this. Kitchen never moves an order to COMPLETED.
   *
   * @param from    Current order status.
   * @param isPaid  Whether the order has been paid.
   * @param orderId Optional order identifier forwarded to exceptions that require it.
   *
   * @throws InvalidStatusTransitionException if `from` is not SERVED.
   * @throws OrderNotPaidException if the order has not been paid yet.
   */
  static assertCanComplete(
    from: OrderStatus,
    isPaid: boolean,
    orderId?: string,
  ): void {
    if (from !== OrderStatus.SERVED) {
      throw new InvalidStatusTransitionException(from, OrderStatus.COMPLETED);
    }
    if (!isPaid) {
      throw new OrderNotPaidException(orderId ?? from);
    }
  }

  /**
   * Validates that the current state permits cancellation.
   *
   * Cancellation is blocked in three scenarios:
   * 1. The order is already cancelled.
   * 2. The order is completed (terminal state — cannot be undone).
   * 3. The order has been paid (must call PATCH /:id/unpay first).
   *
   * @param from    Current order status.
   * @param isPaid  Whether the order has been paid.
   * @param orderId Optional order identifier forwarded to exceptions that require it.
   *
   * @throws OrderAlreadyCancelledException  if `from === CANCELLED`.
   * @throws InvalidStatusTransitionException if `from === COMPLETED`.
   * @throws CannotCancelPaidOrderException  if `isPaid` is true.
   */
  static assertCanCancel(
    from: OrderStatus,
    isPaid: boolean,
    orderId?: string,
  ): void {
    if (from === OrderStatus.CANCELLED) {
      throw new OrderAlreadyCancelledException(orderId ?? from);
    }
    if (from === OrderStatus.COMPLETED) {
      throw new InvalidStatusTransitionException(from, OrderStatus.CANCELLED);
    }
    if (isPaid) {
      throw new CannotCancelPaidOrderException(orderId ?? from);
    }
  }
}
