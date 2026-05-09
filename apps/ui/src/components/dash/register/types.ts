export interface RegisterData {
  id: string;
  openedAt: string;
  lastOrderNumber: number;
  user?: { email: string };
  _count?: { orders: number };
}

export interface PaymentMethodInfo {
  count: number;
  total: number;
}

export interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: Record<string, PaymentMethodInfo>;
}

export interface AlertConfig {
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}
