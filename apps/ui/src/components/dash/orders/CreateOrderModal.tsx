// apps/ui/src/components/dash/orders/CreateOrderModal.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import { useCreateOrderStore } from './create-order-store';
import { createStaffOrder } from './create-order-api';
import CreateOrderStep1 from './CreateOrderStep1';
import CreateOrderStep2, { type OrderType } from './CreateOrderStep2';
import CreateOrderStep3, { detectContactType, type Step3Values } from './CreateOrderStep3';

interface Props {
  onClose: () => void;
  onCreated: (orderNumber: number) => void;
}

function ModalContent({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orderType, setOrderType] = useState<OrderType>('PICKUP');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { items, reset } = useCreateOrderStore();

  function handleClose() {
    reset();
    onClose();
  }

  function handleStep2Next(type: OrderType) {
    setOrderType(type);
    setErrorMsg(null);
    setStep(3);
  }

  async function handleConfirm(formValues: Step3Values) {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const contactRaw = formValues.contact?.trim() ?? '';
      const contactType = contactRaw ? detectContactType(contactRaw) : null;

      const payload = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderType,
        customerName: formValues.customerName.trim(),
        ...(contactType === 'email' ? { customerEmail: contactRaw } : {}),
        ...(contactType === 'phone' ? { customerPhone: contactRaw } : {}),
        ...(formValues.tableNumber?.trim() ? { tableNumber: formValues.tableNumber.trim() } : {}),
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">Nuevo pedido</h2>
          <div className="flex items-center gap-4">
            {/* Step indicator: 3 bubbles */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 1 ? 'bg-blue-600 text-white' : 'bg-blue-200 text-blue-700'}`}>1</span>
              <span className="text-slate-300">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 2 ? 'bg-blue-600 text-white' : step > 2 ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>2</span>
              <span className="text-slate-300">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
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

        {/* Body — scrolls internally, modal height stays fixed */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorMsg && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">
              {errorMsg}
            </div>
          )}

          {step === 1 && <CreateOrderStep1 onNext={() => setStep(2)} />}
          {step === 2 && (
            <CreateOrderStep2 onNext={handleStep2Next} onBack={() => setStep(1)} />
          )}
          {step === 3 && (
            <CreateOrderStep3
              orderType={orderType}
              onBack={() => { setErrorMsg(null); setStep(2); }}
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
  return createPortal(
    <QueryClientProvider client={queryClient}>
      <ModalContent onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>,
    document.body,
  );
}
