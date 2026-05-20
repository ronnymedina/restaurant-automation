import Modal from '../../commons/Modal';
import type { Order } from './api';

const ORDER_TYPE_LABELS: Record<string, string> = {
  PICKUP: 'Retirar en tienda',
  DELIVERY: 'Envío a domicilio',
  DINE_IN: 'En mesa',
};

interface Props {
  order: Order;
  open: boolean;
  onClose: () => void;
}

export function OrderCustomerModal({ order, open, onClose }: Props) {
  const isDelivery = order.orderType === 'DELIVERY';

  return (
    <Modal
      open={open}
      title={`Pedido #${order.orderNumber} — Datos del cliente`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Tipo de entrega
          </p>
          <p className="text-slate-800 font-medium">
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </p>
        </div>

        {(order.customerEmail || order.customerPhone) && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Contacto
            </p>
            {order.customerEmail && (
              <p className="text-slate-800">{order.customerEmail}</p>
            )}
            {order.customerPhone && (
              <p className="text-slate-800">{order.customerPhone}</p>
            )}
          </div>
        )}

        {isDelivery && order.deliveryAddress && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Dirección
            </p>
            <p className="text-slate-800">{order.deliveryAddress}</p>
          </div>
        )}

        {isDelivery && order.deliveryReferences && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Referencias
            </p>
            <p className="text-slate-800 text-sm">{order.deliveryReferences}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
