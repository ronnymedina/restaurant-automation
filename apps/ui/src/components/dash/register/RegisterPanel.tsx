import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api';
import Alert from '../../commons/Alert';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { RegisterData, CloseSummary, AlertConfig } from './types';

const EyeOffIcon = () => (
  <svg
    className="w-4 h-4 inline"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const EyeIcon = () => (
  <svg
    className="w-4 h-4 inline"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function RegisterPanel() {
  const [status, setStatus] = useState<'loading' | 'open' | 'closed' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [registerData, setRegisterData] = useState<RegisterData | null>(null);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [summaryData, setSummaryData] = useState<CloseSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showId, setShowId] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await apiFetch('/v1/cash-register/current');
      if (!res.ok) {
        const msg =
          res.status === 403
            ? 'No tienes permisos para acceder a esta sección'
            : 'Error al cargar el estado de la caja';
        setErrorMessage(msg);
        setStatus('error');
        return;
      }
      const data = await res.json();
      if (!data || !data.id) {
        setRegisterData(null);
        setStatus('closed');
      } else {
        setRegisterData(data);
        setShowId(false);
        setShowEmail(false);
        setStatus('open');
      }
    } catch {
      setErrorMessage('Error al cargar el estado de la caja');
      setStatus('error');
    }
  }, []);

  async function openRegister() {
    const res = await apiFetch('/v1/cash-register/open', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setAlert({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Error al abrir caja',
        onConfirm: () => setAlert(null),
      });
      return;
    }
    loadStatus();
  }

  function handleCloseRegisterClick() {}

  function renderContent() {
    if (status === 'loading') {
      return <p className="text-slate-400 text-center">Cargando...</p>;
    }
    if (status === 'error') {
      return <p className="text-red-400 text-center">{errorMessage}</p>;
    }
    if (status === 'closed') {
      return (
        <div className="text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h3 className="text-xl font-semibold text-slate-700">Caja Cerrada</h3>
          <p className="text-slate-500">No hay una sesión de caja abierta.</p>
          <button
            type="button"
            onClick={openRegister}
            className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer border-none"
          >
            Abrir Caja
          </button>
        </div>
      );
    }
    const d = registerData!;
    const openedAt = new Date(d.openedAt).toLocaleString();
    const orderCount = d._count?.orders ?? 0;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          <h3 className="text-xl font-semibold text-emerald-700">Caja Abierta</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">ID de sesión</p>
            <p className="text-sm font-mono text-slate-700 break-all flex items-center gap-1">
              <span className="font-mono text-sm">{showId ? d.id : '••••••••'}</span>
              <button
                type="button"
                onClick={() => setShowId((v) => !v)}
                className="ml-1.5 text-slate-400 hover:text-slate-600 cursor-pointer align-middle p-0.5"
                title="Mostrar/ocultar"
              >
                {showId ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta por</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <span className="text-base font-semibold">
                {showEmail ? (d.user?.email ?? '-') : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowEmail((v) => !v)}
                className="ml-1.5 text-slate-400 hover:text-slate-600 cursor-pointer align-middle p-0.5"
                title="Mostrar/ocultar"
              >
                {showEmail ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta desde</p>
            <p className="text-lg font-semibold">{openedAt}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Pedidos</p>
            <p className="text-lg font-semibold">{orderCount}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Último # de orden</p>
            <p className="text-lg font-semibold">{d.lastOrderNumber}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCloseRegisterClick}
          className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer border-none"
        >
          Cerrar Caja
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Caja Registradora</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-6">{renderContent()}</div>
      {alert && (
        <Alert
          open={true}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onConfirm={alert.onConfirm}
          onCancel={alert.onCancel}
        />
      )}
      {showSummary && summaryData && (
        <RegisterSummaryModal
          open={showSummary}
          summary={summaryData}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
