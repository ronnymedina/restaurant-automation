// apps/ui/src/components/dash/orders/CreateOrderStep1.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreateOrderStore, selectTotal } from './create-order-store';
import { searchProducts, type ProductSearchResult } from './create-order-api';
import { useRestaurantSettings } from '../../../lib/restaurant-settings';
import { formatMoney } from '../../../lib/money';

interface Props {
  onNext: () => void;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ProductCard({
  product,
  onAdd,
  formatPrice,
}: {
  product: ProductSearchResult;
  onAdd: () => void;
  formatPrice: (amount: number) => string;
}) {
  const isOutOfStock = product.stock !== null && product.stock === 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="w-full h-24 object-cover rounded-lg" />
      ) : (
        <div className="w-full h-24 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">Sin imagen</div>
      )}
      <div className="flex-1">
        <p className="font-medium text-slate-800 text-sm leading-tight">{product.name}</p>
        <p className="text-slate-500 text-xs mt-0.5">{formatPrice(product.price)}</p>
      </div>
      {isOutOfStock ? (
        <span className="text-center text-xs bg-red-100 text-red-600 rounded-lg py-1 font-medium">Agotado</span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="w-full text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-1.5 cursor-pointer"
        >
          + Agregar
        </button>
      )}
    </div>
  );
}

export default function CreateOrderStep1({ onNext }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { items, addItem, removeItem, updateQuantity } = useCreateOrderStore();
  const total = useCreateOrderStore(selectTotal);
  const { data: settings } = useRestaurantSettings();
  const formatPrice = (amount: number) => formatMoney(amount, settings);

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['staff-products', debouncedSearch],
    queryFn: async () => {
      const result = await searchProducts(debouncedSearch);
      return result.ok ? result.data : [];
    },
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto..."
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {isFetching && <p className="text-slate-400 text-xs text-center">Buscando...</p>}

      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-64">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              formatPrice={formatPrice}
              onAdd={() => addItem({ productId: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl })}
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carrito</p>
          {items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-slate-800 truncate">{item.name}</span>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value, 10) || 0)}
                className="w-14 border border-slate-300 rounded-lg px-2 py-1 text-center text-sm"
              />
              <span className="w-16 text-right text-slate-700">{formatPrice(item.price * item.quantity)}</span>
              <button
                type="button"
                onClick={() => removeItem(item.productId)}
                className="text-slate-400 hover:text-red-500 cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-slate-100">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onNext}
          disabled={items.length === 0}
          className="w-full py-2.5 rounded-xl font-semibold text-sm cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
