import { act } from 'react';
import { useCreateOrderStore, selectTotal } from './create-order-store';

const item1 = { productId: 'p1', name: 'Pizza', price: 10, imageUrl: null };
const item2 = { productId: 'p2', name: 'Soda', price: 3, imageUrl: null };

beforeEach(() => {
  act(() => { useCreateOrderStore.getState().reset(); });
});

describe('addItem', () => {
  it('adds a new item with quantity 1', () => {
    act(() => { useCreateOrderStore.getState().addItem(item1); });
    const { items } = useCreateOrderStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
  });

  it('increments quantity if product already in cart', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item1);
    });
    expect(useCreateOrderStore.getState().items[0].quantity).toBe(2);
  });

  it('adds multiple different products', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item2);
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(2);
  });
});

describe('removeItem', () => {
  it('removes product from cart', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().removeItem('p1');
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});

describe('updateQuantity', () => {
  it('updates quantity', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().updateQuantity('p1', 5);
    });
    expect(useCreateOrderStore.getState().items[0].quantity).toBe(5);
  });

  it('removes item when quantity set to 0', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().updateQuantity('p1', 0);
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});

describe('selectTotal', () => {
  it('calculates total correctly', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().addItem(item2);
      useCreateOrderStore.getState().updateQuantity('p1', 2);
    });
    expect(selectTotal(useCreateOrderStore.getState())).toBe(23); // 2*10 + 1*3
  });
});

describe('reset', () => {
  it('clears all items', () => {
    act(() => {
      useCreateOrderStore.getState().addItem(item1);
      useCreateOrderStore.getState().reset();
    });
    expect(useCreateOrderStore.getState().items).toHaveLength(0);
  });
});
