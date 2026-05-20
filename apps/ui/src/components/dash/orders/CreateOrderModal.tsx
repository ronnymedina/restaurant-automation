// apps/ui/src/components/dash/orders/CreateOrderModal.tsx
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import { useCreateOrderStore } from './create-order-store';
import { createStaffOrder } from './create-order-api';
import CreateOrderStep1 from './CreateOrderStep1';
import CreateOrderStep2, { type Step2Values } from './CreateOrderStep2';

interface Props {
  onClose: () => void;
  onCreated: (orderNumber: number) => void;
}

function ModalContent({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { items, reset } = useCreateOrderStore();

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm(formValues: Step2Values) {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderType: formValues.orderType,
        ...(formValues.tableNumber?.trim() ? { tableNumber: formValues.tableNumber.trim() } : {}),
        ...(formValues.customerName?.trim() ? { customerName: formValues.customerName.trim() } : {}),
        ...(formValues.customerPhone?.trim() ? { customerPhone: formValues.customerPhone.trim() } : {}),
        ...(formValues.customerEmail?.trim() ? { customerEmail: formValues.customerEmail.trim() } : {}),
        ...(formValues.deliveryAddress?.trim() ? { deliveryAddress: formValues.deliveryAddress.trim() } : {}),
        ...(formValues.deliveryReferences?.trim() ? { deliveryReferences: formValues.deliveryReferences.trim() } : {}),
      };

      const result = await createStaffOrder(payload);
      if (!result.ok) {
        setErrorMsg(result.error.message ?? 'Error al crear el pedido');
        return;
      }
      reset();
      onCreated(result.data.order.orderNumber);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Nuevo pedido</h2>
          <div className="flex items-center gap-4">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>1</span>
              <span className="text-slate-400">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>2</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {errorMsg && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">
              {errorMsg}
            </div>
          )}

          {step === 1 && <CreateOrderStep1 onNext={() => setStep(2)} />}
          {step === 2 && (
            <CreateOrderStep2
              onBack={() => setStep(1)}
              onSubmit={handleConfirm}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateOrderModal({ onClose, onCreated }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ModalContent onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>
  );
}
