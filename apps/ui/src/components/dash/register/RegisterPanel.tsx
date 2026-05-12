import { useState, useEffect } from 'react';

import Alert from '../../commons/Alert';
import RegisterSummaryModal from './RegisterSummaryModal';
import { EyeIcon, EyeOffIcon } from '../../commons/icons';

import { getCurrentSession, openSession, closeSession } from './api';

import type { CashShiftDto, CloseSummary } from './api';
import type { RegisterStatus, AlertConfig } from './types';

import { REGISTER_STATUS, ALERT_TYPE } from './types';

export default function RegisterPanel() {
  const [status, setStatus] = useState<RegisterStatus>(REGISTER_STATUS.LOADING);
  const [errorMessage, setErrorMessage] = useState('');
  const [registerData, setRegisterData] = useState<CashShiftDto | null>(null);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [summaryData, setSummaryData] = useState<CloseSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    async function load() {
      setStatus(REGISTER_STATUS.LOADING);
      const result = await getCurrentSession();
      if (!result.ok) {
        setErrorMessage(
          result.httpStatus === 403
            ? 'No tienes permisos para acceder a esta sección'
            : 'Error al cargar el estado de la caja',
        );
        setStatus(REGISTER_STATUS.ERROR);
        return;
      }
      if (!result.data) {
        setStatus(REGISTER_STATUS.CLOSED);
        return;
      }
      setRegisterData(result.data);
      setShowSensitive(false);
      setStatus(REGISTER_STATUS.OPEN);
    }
    load();
  }, []);

  async function openRegister() {
    const result = await openSession();
    if (!result.ok) {
      setAlert({
        type: ALERT_TYPE.ERROR,
        title: 'Error',
        message: result.error.message || 'Error al abrir caja',
        onConfirm: () => setAlert(null),
      });
      return;
    }
    setRegisterData(result.data);
    setShowSensitive(false);
    setStatus(REGISTER_STATUS.OPEN);
  }

  function handleCloseRegisterClick() {
    setAlert({
      type: ALERT_TYPE.WARNING,
      title: 'Cerrar caja',
      message: '¿Estás seguro de cerrar la caja?',
      onConfirm: performClose,
      onCancel: () => setAlert(null),
    });
  }

  async function performClose() {
    setAlert(null);
    const result = await closeSession();
    if (!result.ok) {
      if (result.error.code === 'PENDING_ORDERS_ON_SHIFT') {
        const count = (result.error.details?.pendingCount as number) ?? 'algunos';
        setAlert({
          type: ALERT_TYPE.ERROR,
          title: 'No se puede cerrar',
          message: `Hay ${count} pedido(s) pendiente(s). Completa o cancela los pedidos antes de cerrar.`,
          onConfirm: () => setAlert(null),
        });
      } else {
        setAlert({
          type: ALERT_TYPE.ERROR,
          title: 'Error',
          message: result.error.message || 'Error al cerrar caja',
          onConfirm: () => setAlert(null),
        });
      }
      return;
    }
    setSummaryData(result.data.summary);
    setShowSummary(true);
    setRegisterData(null);
    setStatus(REGISTER_STATUS.CLOSED);
  }

  function renderContent() {
    if (status === REGISTER_STATUS.LOADING) {
      return <p className="text-slate-400 text-center">Cargando...</p>;
    }
    if (status === REGISTER_STATUS.ERROR) {
      return <p className="text-red-400 text-center">{errorMessage}</p>;
    }
    if (status === REGISTER_STATUS.CLOSED) {
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
    const openedAt = d.displayOpenedAt;
    const orderCount = d._count?.orders ?? 0;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          <h3 className="text-xl font-semibold text-emerald-700">Caja Abierta</h3>
          <button
            type="button"
            onClick={() => setShowSensitive((v) => !v)}
            className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
            title="Mostrar/ocultar datos sensibles"
          >
            {showSensitive ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">ID de sesión</p>
            <p className="text-sm font-mono text-slate-700 break-all">
              {showSensitive ? d.id : '••••••••'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta por</p>
            <p className="text-base font-semibold">
              {showSensitive ? (d.openedByEmail ?? '-') : '••••••••'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta desde</p>
            <p className="text-lg font-semibold">{openedAt}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Pedidos</p>
            <p className="text-lg font-semibold">{orderCount}</p>
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
