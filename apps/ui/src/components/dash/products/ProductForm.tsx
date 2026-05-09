import { useState, useEffect, useRef } from 'react';
import Button from '../../commons/Button';
import type { Category, Product, ProductPayload } from '../../../lib/products-api';
import { createProduct, updateProduct, uploadImage } from '../../../lib/products-api';
import { ProductSchema } from "./validationScheme"

const UploadStatus = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
} as const;

interface ProductFormProps {
  initialData?: Product;
  categories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProductForm({ initialData, categories, onSuccess, onCancel }: ProductFormProps) {
  const isEditing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    initialData?.categoryId ?? categories[0]?.id ?? '',
  );
  const [price, setPrice] = useState(
    initialData?.price !== undefined ? String(initialData.price) : '',
  );
  const [stock, setStock] = useState(
    initialData?.stock !== null && initialData?.stock !== undefined
      ? String(initialData.stock)
      : '',
  );
  const [sku, setSku] = useState(initialData?.sku ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [active, setActive] = useState(initialData?.active !== false);
  const [imageUrlInput, setImageUrlInput] = useState('');

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSizeMB, setUploadFileSizeMB] = useState('');
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    initialData?.imageUrl ?? null,
  );
  const [imageRemoved, setImageRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditing && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, isEditing, categoryId]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const handleFileSelect = async (file: File) => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    const blob = URL.createObjectURL(file);
    setPreviewBlobUrl(blob);
    setUploadFileName(file.name);
    setUploadFileSizeMB((file.size / 1024 / 1024).toFixed(1));
    setUploadStatus(UploadStatus.UPLOADING);
    setUploadedImageUrl(null);
    setCurrentImageUrl(null);
    setImageRemoved(false);
    try {
      const url = await uploadImage(file);
      setUploadedImageUrl(url);
      setUploadStatus(UploadStatus.DONE);
    } catch {
      setUploadStatus(UploadStatus.ERROR);
    }
  };

  const clearFileSelection = () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setUploadedImageUrl(null);
    setUploadStatus(UploadStatus.IDLE);
    setUploadFileName('');
    setUploadFileSizeMB('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (uploadStatus === UploadStatus.UPLOADING) {
      setErrors(['La imagen aún se está subiendo, espera un momento']);
      return;
    }

    if (uploadStatus === UploadStatus.ERROR) {
      setErrors(['La subida de imagen falló. Quita el archivo e intenta de nuevo.']);
      return;
    }

    const resolvedImageUrl: string | null | undefined = uploadedImageUrl
      ? uploadedImageUrl
      : imageRemoved
        ? null
        : imageUrlInput || undefined;

    const raw = {
      name,
      categoryId,
      price: Number(price.replace(',', '.')),
      stock: isEditing ? (stock === '' ? null : Number(stock)) : stock ? Number(stock) : undefined,
      sku: sku || undefined,
      imageUrl: resolvedImageUrl,
      description: description || undefined,
      active,
    };

    const result = ProductSchema.safeParse(raw);
    if (!result.success) {
      setErrors(result.error.issues.map((i) => i.message));
      return;
    }

    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateProduct(initialData.id, result.data);
      } else {
        await createProduct(result.data as ProductPayload);
      }
      onSuccess();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        {isEditing ? 'Editar producto' : 'Nuevo producto'}
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="pf-name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre *
          </label>
          <input
            id="pf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-price" className="block text-sm font-medium text-slate-700 mb-1">
            Precio *
          </label>
          <input
            id="pf-price"
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-stock" className="block text-sm font-medium text-slate-700 mb-1">
            Stock
          </label>
          <input
            id="pf-stock"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            min="0"
            placeholder="Vacío = ilimitado (∞)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-sku" className="block text-sm font-medium text-slate-700 mb-1">
            SKU
          </label>
          <input
            id="pf-sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-category" className="block text-sm font-medium text-slate-700 mb-1">
            Categoría *
          </label>
          <select
            id="pf-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Imagen del producto
          </label>

          {currentImageUrl && uploadStatus === UploadStatus.IDLE && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
              <img
                src={currentImageUrl}
                alt="imagen actual"
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">Imagen actual</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{currentImageUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentImageUrl(null);
                  setImageRemoved(true);
                }}
                className="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0"
              >
                ✕ Quitar
              </button>
            </div>
          )}

          {!currentImageUrl && uploadStatus === UploadStatus.IDLE && (
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors mb-2"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              <p className="text-sm text-slate-500">
                Arrastra una imagen o{' '}
                <span className="text-indigo-600 font-medium">haz clic para seleccionar</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                JPG, PNG, WEBP — si pesa más de 10 MB se comprime automáticamente
              </p>
            </div>
          )}

          {uploadStatus !== UploadStatus.IDLE && previewBlobUrl && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
              <img src={previewBlobUrl} alt="preview" className="w-16 h-16 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{uploadFileName}</p>
                <p
                  className={`text-xs mt-0.5 ${
                    uploadStatus === UploadStatus.DONE
                      ? 'text-green-600'
                      : uploadStatus === UploadStatus.ERROR
                        ? 'text-red-600'
                        : 'text-slate-500'
                  }`}
                >
                  {uploadStatus === UploadStatus.UPLOADING && `${uploadFileSizeMB} MB — subiendo...`}
                  {uploadStatus === UploadStatus.DONE && '✓ Subida correctamente'}
                  {uploadStatus === UploadStatus.ERROR && '⚠ Error al subir la imagen'}
                </p>
              </div>
              <button
                type="button"
                onClick={clearFileSelection}
                className="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0"
              >
                ✕ Quitar
              </button>
            </div>
          )}

          {uploadStatus === UploadStatus.IDLE && !currentImageUrl && (
            <>
              <p className="text-xs text-blue-600 mb-1">
                💡 ¿Foto muy pesada?{' '}
                <a
                  href="https://tinypng.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Comprímela gratis en tinypng.com
                </a>
              </p>
              <input
                id="pf-image-url"
                type="text"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="O pega una URL externa de imagen"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="pf-description" className="block text-sm font-medium text-slate-700 mb-1">
            Descripción
          </label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="pf-active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="pf-active" className="text-sm font-medium text-slate-700">
            Producto activo
          </label>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button
            type="submit"
            disabled={isSubmitting || uploadStatus === UploadStatus.UPLOADING}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>

        {errors.length > 0 && (
          <p className="md:col-span-2 text-sm text-red-600">{errors.join(', ')}</p>
        )}
      </form>
    </div>
  );
}
