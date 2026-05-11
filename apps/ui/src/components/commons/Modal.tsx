import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <h3 id="modal-title" className="text-xl font-bold text-slate-800">
          {title}
        </h3>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium cursor-pointer border-none hover:bg-indigo-700"
        >
          Cerrar
        </button>
      </div>
    </div>,
    document.body,
  );
}
