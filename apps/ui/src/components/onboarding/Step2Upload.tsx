import { useState, useRef } from 'react';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Solo se aceptan imágenes en formato JPG o PNG.';
  if (file.size > MAX_SIZE_BYTES) return 'La imagen no puede superar 5 MB.';
  return null;
}

interface Step2UploadProps {
  onSubmit: (photo: File | null, useDemo: boolean) => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function Step2Upload({ onSubmit, onBack, isLoading, error }: Step2UploadProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      setPhoto(null);
    } else {
      setFileError(null);
      setPhoto(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl text-slate-800 mb-2 font-bold">Tu Menú</h2>
        <p className="text-slate-500 text-base">Carga tu carta para comenzar</p>
      </div>

      <div className="flex gap-3 items-start bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5">
        <div className="text-[#f97316] flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        </div>
        <p className="text-sm text-[#9a3412] m-0 leading-relaxed">
          <strong className="block mb-0.5">Procesamiento con inteligencia artificial</strong>
          Sube una fotografía de tu menú y extraeremos tus productos de forma automática.
          Te recomendamos revisar los resultados, ya que pueden requerir ajustes.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-3 ${
          photo
            ? 'border-[#f97316] bg-orange-50'
            : isDragOver
              ? 'border-[#f97316]/70 bg-orange-50'
              : 'border-slate-200 bg-gray-50 hover:border-[#f97316] hover:bg-orange-50/50'
        }`}
      >
        <div className={`mb-3 ${photo ? 'text-[#f97316]' : 'text-[#f97316]/30'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        {photo ? (
          <>
            <p className="text-slate-800 font-medium m-0 mb-1">Foto seleccionada</p>
            <p className="text-[#f97316] text-sm m-0">Haz clic para cambiarla</p>
          </>
        ) : (
          <>
            <p className="text-slate-800 font-medium m-0 mb-1">Arrastra la foto aquí o haz clic</p>
            <p className="text-slate-500 text-sm m-0">1 imagen · PNG o JPG · máx 5 MB</p>
          </>
        )}
        <input
          data-testid="photo-input"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {fileError && (
        <p className="text-red-500 text-xs mb-3 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
          </svg>
          {fileError}
        </p>
      )}

      {photo && (
        <div className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2 mb-4 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            {photo.name}
          </div>
          <button
            type="button"
            aria-label="Eliminar foto"
            onClick={(e) => { e.stopPropagation(); setPhoto(null); setFileError(null); }}
            className="text-red-500 hover:text-red-700 text-lg leading-none bg-transparent border-none cursor-pointer p-0"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm mb-4 text-center font-medium">{error}</p>
      )}

      <div className="flex gap-3 mb-3">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onSubmit(photo, false)}
          aria-label={photo ? 'Procesar Menú' : 'Continuar'}
          className="flex-1 py-4 px-6 bg-[#f97316] text-white border-none rounded-xl text-base font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-[#ea6c0a] hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {isLoading ? 'Procesando...' : photo ? 'Procesar Menú' : 'Continuar'}
          {!isLoading && (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onSubmit(null, true)}
        className="w-full py-3 px-6 bg-white text-slate-500 border-2 border-slate-200 rounded-xl text-sm font-semibold cursor-pointer transition-all hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
      >
        Usar datos demo
      </button>

      <button
        type="button"
        disabled={isLoading}
        onClick={onBack}
        className="flex items-center gap-1 bg-transparent border-none text-slate-400 text-sm cursor-pointer p-0 hover:text-[#f97316] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Volver
      </button>
    </>
  );
}
