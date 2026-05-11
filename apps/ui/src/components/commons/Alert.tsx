import React from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export const ALERT_TYPE = {
  ERROR: 'error',
  WARNING: 'warning',
  SUCCESS: 'success',
  INFO: 'info',
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

interface AlertProps {
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const config: Record<
  AlertType,
  { iconBg: string; iconColor: string; btnColor: string; defaultConfirm: string; iconPath: ReactNode }
> = {
  error: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-500',
    btnColor: 'bg-red-500 hover:bg-red-600',
    defaultConfirm: 'Entendido',
    iconPath: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    ),
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-500',
    btnColor: 'bg-amber-500 hover:bg-amber-600',
    defaultConfirm: 'Confirmar',
    iconPath: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    ),
  },
  success: {
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-500',
    btnColor: 'bg-emerald-500 hover:bg-emerald-600',
    defaultConfirm: 'Cerrar',
    iconPath: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  info: {
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-500',
    btnColor: 'bg-indigo-500 hover:bg-indigo-600',
    defaultConfirm: 'OK',
    iconPath: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    ),
  },
};

export default function Alert({
  open,
  type,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: AlertProps) {
  if (!open) return null;

  const { iconBg, iconColor, btnColor, defaultConfirm, iconPath } = config[type];
  const resolvedConfirm = confirmLabel ?? defaultConfirm;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 animate-modal-in"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className={`flex items-center justify-center w-14 h-14 rounded-full ${iconBg} ${iconColor}`}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-7 h-7"
            >
              {iconPath}
            </svg>
          </div>

          <div className="space-y-1">
            <h2 className="font-bold text-slate-800 text-lg leading-snug">{title}</h2>
            <p className="text-slate-600 text-sm">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex gap-3 justify-center">
          {type === ALERT_TYPE.WARNING && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-lg
                bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg
              text-white transition-colors cursor-pointer ${btnColor}`}
          >
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
