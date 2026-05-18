import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { getOrGenerateQR } from '../../lib/kiosk-qr';
import { config } from '../../config';

export default function KioskQrButton() {
  const [kioskUrl, setKioskUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/v1/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const s = data?.restaurant?.slug;
        if (!s) return;
        const base = config.storefrontUrl || window.location.origin;
        setSlug(s);
        setKioskUrl(`${base}/kiosk?slug=${s}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || !slug || !kioskUrl) return;
    getOrGenerateQR(slug, kioskUrl).then(setQrDataUrl).catch(() => {});
  }, [open, slug, kioskUrl]);

  if (!kioskUrl) return null;

  function handleCopy() {
    navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer bg-transparent border-none p-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        Ver QR y enlace
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kiosko público"
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={handleBackdrop}
        >
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Kiosko público</h2>
                <p className="text-xs text-slate-400 mt-0.5">Enlace y código QR para tus clientes</p>
              </div>
              <button
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer border-none bg-transparent text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* URL */}
            <div className="px-6 pt-5 pb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Enlace</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <span className="flex-1 text-sm text-slate-700 truncate font-mono">{kioskUrl}</span>
                <button
                  title={copied ? '¡Copiado!' : 'Copiar'}
                  onClick={handleCopy}
                  className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 bg-transparent border-none cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <a
                  href={`/kiosk?slug=${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir en nueva pestaña"
                  className="shrink-0 p-1 text-slate-400 hover:text-indigo-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* QR */}
            <div className="px-6 pb-6 flex flex-col items-center gap-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider self-start">Código QR</p>
              <div className="flex items-center justify-center w-[240px] h-[240px] bg-slate-50 rounded-lg border border-slate-200">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="QR Kiosko" width={240} height={240} className="rounded" />
                  : <span className="text-slate-400 text-sm">Generando...</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
