// apps/ui/src/components/dash/orders/create-order-store.ts
import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}

interface CreateOrderStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  reset: () => void;
}

export const useCreateOrderStore = create<CreateOrderStore>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return { items: [...state.items, { ...item, quantity: 1 }] };
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { items: state.items.filter((i) => i.productId !== productId) };
      return { items: state.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)) };
    }),

  reset: () => set({ items: [] }),
}));

export const selectTotal = (state: CreateOrderStore) =>
  state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

export const selectItemCount = (state: CreateOrderStore) =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);
