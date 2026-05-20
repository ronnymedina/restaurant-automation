// apps/ui/src/components/dash/orders/CreateOrderStep3.tsx
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateOrderStore, selectTotal } from './create-order-store';
import type { OrderType } from './CreateOrderStep2';

export type Step3Values = {
  customerName: string;
  contact: string;
  tableNumber: string;
  deliveryAddress: string;
  deliveryReferences: string;
};

export function detectContactType(value: string): 'email' | 'phone' {
  return value.includes('@') ? 'email' : 'phone';
}

function makeSchema(orderType: OrderType) {
  return z
    .object({
      customerName: z.string().min(1, 'El nombre es requerido'),
      contact: z.string().optional(),
      tableNumber: z.string().optional(),
      deliveryAddress: z.string().optional(),
      deliveryReferences: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (orderType === 'DINE_IN' && !data.tableNumber?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Número de mesa requerido' });
      }
      if (orderType === 'DELIVERY' && !data.contact?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['contact'], message: 'Teléfono o email requerido' });
      }
      if (orderType === 'DELIVERY' && !data.deliveryAddress?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Dirección requerida' });
      }
    });
}

interface Props {
  orderType: OrderType;
  onBack: () => void;
  onSubmit: (values: Step3Values) => void;
  isSubmitting: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  PICKUP: 'Retiro',
  DINE_IN: 'En mesa',
  DELIVERY: 'Delivery',
};

export default function CreateOrderStep3({ orderType, onBack, onSubmit, isSubmitting }: Props) {
  const items = useCreateOrderStore((s) => s.items);
  const total = useCreateOrderStore(selectTotal);

  const schema = useMemo(() => makeSchema(orderType), [orderType]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step3Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      contact: '',
      tableNumber: '',
      deliveryAddress: '',
      deliveryReferences: '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm text-slate-500">
        Tipo:{' '}
        <span className="font-semibold text-slate-800">{ORDER_TYPE_LABELS[orderType]}</span>
      </div>

      {/* Name — required for all types */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Nombre del cliente <span className="text-red-500">*</span>
        </label>
        <input
          {...register('customerName')}
          placeholder="Nombre del cliente"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <FieldError message={errors.customerName?.message} />
      </div>

      {/* Table number — DINE_IN only */}
      {orderType === 'DINE_IN' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Número de mesa <span className="text-red-500">*</span>
          </label>
          <input
            {...register('tableNumber')}
            placeholder="Ej: 5"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.tableNumber?.message} />
        </div>
      )}

      {/* Smart contact — PICKUP (optional) and DELIVERY (required) */}
      {(orderType === 'PICKUP' || orderType === 'DELIVERY') && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Teléfono o email{' '}
            {orderType === 'DELIVERY' ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="text-slate-400 normal-case font-normal">(opcional)</span>
            )}
          </label>
          <input
            {...register('contact')}
            placeholder="Ej: 555-1234 o tu@email.com"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.contact?.message} />
        </div>
      )}

      {/* Address and references — DELIVERY only */}
      {orderType === 'DELIVERY' && (
        <>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              {...register('deliveryAddress')}
              placeholder="Calle, número, colonia"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FieldError message={errors.deliveryAddress?.message} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Referencias{' '}
              <span className="text-slate-400 normal-case font-normal">(opcional)</span>
            </label>
            <input
              {...register('deliveryReferences')}
              placeholder="Ej. puerta azul, 2do piso"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Order summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resumen</p>
        {items.map((item) => (
          <div key={item.productId} className="flex justify-between text-slate-700">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>${((item.price * item.quantity) / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-slate-800 mt-2 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span>${(total / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm cursor-pointer hover:bg-slate-50 disabled:opacity-40"
        >
          ← Volver
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creando...' : 'Confirmar pedido'}
        </button>
      </div>
    </form>
  );
}
