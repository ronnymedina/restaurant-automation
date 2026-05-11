import type { AlertType } from '../../commons/Alert';

export { ALERT_TYPE } from '../../commons/Alert';
export type { AlertType };

export const REGISTER_STATUS = {
  LOADING: 'loading',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error',
} as const;

export type RegisterStatus = (typeof REGISTER_STATUS)[keyof typeof REGISTER_STATUS];

export interface AlertConfig {
  type: AlertType;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}
