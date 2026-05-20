// apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateOrderStore, selectTotal } from './create-order-store';

const step2Schema = z.object({
  orderType: z.enum(['PICKUP', 'DINE_IN', 'DELIVERY']),
  tableNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  deliveryAddress: z.string().optional(),
  deliveryReferences: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.orderType === 'DINE_IN' && !data.tableNumber?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Número de mesa requerido' });
  }
  if (data.orderType === 'DELIVERY' && !data.deliveryAddress?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Dirección requerida' });
  }
});

export type Step2Values = z.infer<typeof step2Schema>;

interface Props {
  onBack: () => void;
  onSubmit: (values: Step2Values) => void;
  isSubmitting: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

export default function CreateOrderStep2({ onBack, onSubmit, isSubmitting }: Props) {
  const items = useCreateOrderStore((s) => s.items);
  const total = useCreateOrderStore(selectTotal);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { orderType: 'PICKUP' },
  });

  const orderType = watch('orderType');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* Order type selector */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo de entrega</label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {(['PICKUP', 'DINE_IN', 'DELIVERY'] as const).map((type) => {
            const labels = { PICKUP: 'Para llevar', DINE_IN: 'En mesa', DELIVERY: 'Delivery' };
            return (
              <label
                key={type}
                className={`cursor-pointer text-center text-sm rounded-xl border px-2 py-2 transition-colors ${
                  orderType === type
                    ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400'
                }`}
              >
                <input type="radio" value={type} {...register('orderType')} className="sr-only" />
                {labels[type]}
              </label>
            );
          })}
        </div>
      </div>

      {/* DINE_IN: mesa */}
      {orderType === 'DINE_IN' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Número de mesa *</label>
          <input
            {...register('tableNumber')}
            placeholder="Ej: 5"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.tableNumber?.message} />
        </div>
      )}

      {/* Customer fields — always visible */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre del cliente</label>
        <input
          {...register('customerName')}
          placeholder="Opcional"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Teléfono</label>
        <input
          {...register('customerPhone')}
          placeholder="Opcional"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* DELIVERY: address */}
      {orderType === 'DELIVERY' && (
        <>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dirección *</label>
            <input
              {...register('deliveryAddress')}
              placeholder="Calle, número, colonia"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FieldError message={errors.deliveryAddress?.message} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Referencias</label>
            <input
              {...register('deliveryReferences')}
              placeholder="Opcional"
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
            <span>{item.name} × {item.quantity}</span>
            <span>${((item.price * item.quantity) / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-slate-800 mt-2 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span>${(total / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
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
