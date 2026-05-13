export const ORDERS_STATUS = {
  LOADING: 'loading',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error',
} as const;

export type OrdersStatus = (typeof ORDERS_STATUS)[keyof typeof ORDERS_STATUS];

export const ORDER_STATUS = {
  CREATED: 'CREATED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
