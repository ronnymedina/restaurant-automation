export type KioskTheme = {
  primary: string
  primaryDark: string
  accent: string
  background: string
  surface: string
  text: string
  textMuted: string
}

export const KioskView = {
  MENU: 'menu',
  CART: 'cart',
  CHECKOUT: 'checkout',
  CONFIRMATION: 'confirmation',
} as const
export type KioskView = (typeof KioskView)[keyof typeof KioskView]

export type PaymentMethod = 'CASH' | 'CARD' | 'DIGITAL_WALLET'

export type Menu = {
  id: string
  name: string
}

export type MenuItem = {
  id: string
  menuItemId?: string
  name: string
  description?: string
  price: number
  imageUrl?: string
  stockStatus: 'available' | 'low_stock' | 'out_of_stock'
}

export type CartItem = {
  productId: string
  menuItemId?: string
  name: string
  price: number
  oldPrice?: number
  quantity: number
  notes: string
}

export type AddToCartPayload = {
  productId: string
  menuItemId?: string
  name: string
  price: number
}

export type ConfirmedOrder = {
  orderNumber: number
  totalAmount: number
  items: CartItem[]
}

export type KioskStore = {
  slug: string
  sessionOpen: boolean
  isLoading: boolean
  menus: Menu[]
  activeMenuId: string | null
  menuSections: Record<string, MenuItem[]>
  cart: CartItem[]
  selectedPayment: PaymentMethod | null
  customerEmail: string
  isSubmitting: boolean
  view: KioskView
  confirmedOrder: ConfirmedOrder | null
  errorMessage: string | null
  cartPriceSnapshot: Map<string, number> | null
}
