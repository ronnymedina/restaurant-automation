import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('./store/kiosk.store', () => ({
  useKioskStore: (selector: (s: any) => any) =>
    selector({
      cart: [{ productId: 'p1', menuItemId: undefined, name: 'Burger', price: 10, quantity: 2, notes: '' }],
      menuSections: {},
      updateQuantity: vi.fn(),
      updateNotes: vi.fn(),
    }),
}))

import { CartPanel } from './CartPanel'

const theme = {
  primary: '#059669', primaryDark: '#047857', accent: '#d97706',
  background: '#fffbeb', surface: '#ffffff', text: '#1e293b', textMuted: '#94a3b8',
}

test('overlay variant renders backdrop', () => {
  render(<CartPanel variant="overlay" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(document.querySelector('.fixed.inset-0')).toBeTruthy()
})

test('sidebar variant renders no backdrop', () => {
  render(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(document.querySelector('.fixed.inset-0')).toBeNull()
})

test('sidebar variant has no close button', () => {
  render(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(screen.queryByRole('button', { name: /×/i })).toBeNull()
})

test('both variants show checkout button', () => {
  const { rerender } = render(
    <CartPanel variant="overlay" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />
  )
  expect(screen.getByRole('button', { name: 'Pagar' })).toBeTruthy()

  rerender(<CartPanel variant="sidebar" onClose={vi.fn()} onCheckout={vi.fn()} theme={theme} />)
  expect(screen.getByRole('button', { name: 'Pagar' })).toBeTruthy()
})
