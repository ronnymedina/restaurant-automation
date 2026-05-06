import { create } from 'zustand'
import { kioskFetch } from '../../../lib/kiosk-api'
import {
  type AddToCartPayload,
  type CartItem,
  type ConfirmedOrder,
  type KioskStore,
  type Menu,
  type MenuItem,
  type PaymentMethod,
  KioskView,
} from '../types/kiosk.types'

type KioskActions = {
  init(slug: string): Promise<void>
  loadMenus(): Promise<void>
  selectMenu(menuId: string): Promise<void>
  addToCart(item: AddToCartPayload): void
  updateQuantity(productId: string, menuItemId: string | undefined, delta: number): void
  updateNotes(productId: string, menuItemId: string | undefined, notes: string): void
  clearCart(): void
  setPayment(method: PaymentMethod): void
  setCustomerEmail(email: string): void
  placeOrder(): Promise<void>
  resetOrder(): void
  setView(view: KioskView): void
  clearError(): void
}

function cartItemKey(productId: string, menuItemId?: string): string {
  return `${productId}:${menuItemId ?? ''}`
}

function findCartItem(
  cart: CartItem[],
  productId: string,
  menuItemId: string | undefined,
): CartItem | undefined {
  return cart.find(
    (c) => c.productId === productId && c.menuItemId === menuItemId,
  )
}

function findMenuItemStock(
  menuSections: Record<string, Record<string, MenuItem[]>>,
  productId: string,
  menuItemId: string | undefined,
): number | null | undefined {
  for (const sections of Object.values(menuSections)) {
    for (const items of Object.values(sections)) {
      const found = items.find((i) => i.id === productId && i.menuItemId === menuItemId)
      if (found) return found.stock
    }
  }
  return undefined
}

const initialState: KioskStore = {
  slug: '',
  sessionOpen: false,
  isLoading: true,
  menus: [],
  activeMenuId: null,
  menuSections: {},
  cart: [],
  selectedPayment: null,
  customerEmail: '',
  isSubmitting: false,
  view: KioskView.MENU,
  confirmedOrder: null,
  errorMessage: null,
  cartPriceSnapshot: null,
}

export const useKioskStore = create<KioskStore & KioskActions>((set, get) => ({
  ...initialState,

  async init(slug: string): Promise<void> {
    set({ slug, isLoading: true })

    let sessionOpen = false
    try {
      const res = await kioskFetch(`/v1/kiosk/${slug}/status`)
      if (res.ok) {
        const data = await res.json()
        sessionOpen = data.registerOpen
      }
    } catch {
      // if status check fails, assume closed for safety
      sessionOpen = false
    }

    set({ sessionOpen })

    if (sessionOpen) {
      try {
        await get().loadMenus()
      } catch {
        set({ errorMessage: 'Error al inicializar el menú' })
      }
    }

    set({ isLoading: false })
  },

  async loadMenus(): Promise<void> {
    const { slug } = get()
    const res = await kioskFetch(`/v1/kiosk/${slug}/menus`)

    if (!res.ok) {
      set({ errorMessage: 'No se pudieron cargar los menús' })
      return
    }

    const menus: Menu[] = await res.json()
    set({ menus })

    if (menus.length > 0) {
      await get().selectMenu(menus[0].id)
    }
  },

  async selectMenu(menuId: string): Promise<void> {
    const { slug } = get()
    set({ activeMenuId: menuId })

    const res = await kioskFetch(`/v1/kiosk/${slug}/menus/${menuId}/items`)

    if (!res.ok) {
      set({ errorMessage: 'Error al cargar productos' })
      return
    }

    const data: { menuName: string; sections: Record<string, MenuItem[]> } =
      await res.json()

    const { cart, cartPriceSnapshot } = get()

    // Clear snapshot before updating state so it's consumed exactly once
    set({ cartPriceSnapshot: null })

    if (cartPriceSnapshot) {
      // Price-change sync: update any cart items whose prices changed
      let updatedCart = [...cart]

      for (const sectionItems of Object.values(data.sections)) {
        for (const item of sectionItems) {
          const key = cartItemKey(item.id, item.menuItemId)
          const snapshotPrice = cartPriceSnapshot.get(key)
          if (snapshotPrice !== undefined && Math.abs(snapshotPrice - item.price) > 0.01) {
            updatedCart = updatedCart.map((c) => {
              if (cartItemKey(c.productId, c.menuItemId) === key) {
                return { ...c, price: item.price, oldPrice: snapshotPrice }
              }
              return c
            })
          }
        }
      }

      set({ cart: updatedCart })
    }

    set((state) => ({
      menuSections: {
        ...state.menuSections,
        [menuId]: data.sections,
      },
    }))
  },

  addToCart(item: AddToCartPayload): void {
    const { cart, menuSections } = get()
    const existing = findCartItem(cart, item.productId, item.menuItemId)
    const currentQty = existing?.quantity ?? 0
    const stock = findMenuItemStock(menuSections, item.productId, item.menuItemId)

    if (stock !== null && stock !== undefined && currentQty >= stock) {
      const msg = stock === 0
        ? `"${item.name}" está agotado`
        : `Solo quedan ${stock} unidades de "${item.name}"`
      set({ errorMessage: msg })
      return
    }

    if (existing) {
      set({
        cart: cart.map((c) =>
          c === existing ? { ...c, quantity: c.quantity + 1 } : c,
        ),
      })
    } else {
      set({ cart: [...cart, { ...item, quantity: 1, notes: '' }] })
    }
  },

  updateQuantity(
    productId: string,
    menuItemId: string | undefined,
    delta: number,
  ): void {
    const { cart, menuSections } = get()

    if (delta > 0) {
      const existing = findCartItem(cart, productId, menuItemId)
      const stock = findMenuItemStock(menuSections, productId, menuItemId)
      if (stock !== null && stock !== undefined && existing && existing.quantity >= stock) {
        set({ errorMessage: `Solo quedan ${stock} unidades de "${existing.name}"` })
        return
      }
    }

    const updated = cart
      .map((c) => {
        if (c.productId === productId && c.menuItemId === menuItemId) {
          return { ...c, quantity: c.quantity + delta }
        }
        return c
      })
      .filter((c) => c.quantity > 0)

    set({ cart: updated })
  },

  updateNotes(
    productId: string,
    menuItemId: string | undefined,
    notes: string,
  ): void {
    const { cart } = get()
    set({
      cart: cart.map((c) => {
        if (c.productId === productId && c.menuItemId === menuItemId) {
          return { ...c, notes }
        }
        return c
      }),
    })
  },

  clearCart(): void {
    set({ cart: [] })
  },

  setPayment(method: PaymentMethod): void {
    set({ selectedPayment: method })
  },

  setCustomerEmail(email: string): void {
    set({ customerEmail: email })
  },

  async placeOrder(): Promise<void> {
    const { slug, cart, selectedPayment, customerEmail, activeMenuId } = get()

    // Guard: should not be callable without a payment method and items
    if (!selectedPayment || cart.length === 0) return

    set({ isSubmitting: true })

    const body = {
      items: cart.map((c) => ({
        productId: c.productId,
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        notes: c.notes || undefined,
      })),
      paymentMethod: selectedPayment,
      customerEmail: customerEmail || undefined,
      expectedTotal: cart.reduce((s, c) => s + c.price * c.quantity, 0),
    }

    try {
      const res = await kioskFetch(`/v1/kiosk/${slug}/orders`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)

        if (res.status === 409 && err?.code === 'STOCK_INSUFFICIENT') {
          const { productName, available } = (err?.details ?? {}) as { productName?: string; available?: number }
          const msg = available && available > 0
            ? `Solo quedan ${available} unidades de "${productName}". Ajusta las cantidades.`
            : `"${productName}" se agotó. Retíralo de tu carrito.`
          if (activeMenuId) await get().selectMenu(activeMenuId)
          set({ view: KioskView.CART, errorMessage: msg })
          return
        }

        if (res.status === 400 && activeMenuId) {
          // Snapshot current prices so selectMenu can detect changes
          set({
            cartPriceSnapshot: new Map(
              cart.map((c) => [cartItemKey(c.productId, c.menuItemId), c.price]),
            ),
          })
          await get().selectMenu(activeMenuId)
          set({ view: KioskView.CART })
        }

        set({ errorMessage: err?.message ?? 'Error al crear el pedido' })
        return
      }

      const { order } = await res.json()

      const confirmedOrder: ConfirmedOrder = {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        items: [...cart],
      }

      set({ confirmedOrder, view: KioskView.CONFIRMATION })
    } catch {
      set({ errorMessage: 'Error de conexión' })
    } finally {
      set({ isSubmitting: false })
    }
  },

  resetOrder(): void {
    const { activeMenuId } = get()
    set({
      cart: [],
      cartPriceSnapshot: null,
      selectedPayment: null,
      customerEmail: '',
      confirmedOrder: null,
      errorMessage: null,
      isSubmitting: false,
      view: KioskView.MENU,
    })
    if (activeMenuId) {
      get().selectMenu(activeMenuId)
    }
  },

  setView(view: KioskView): void {
    set({ view })
  },

  clearError(): void {
    set({ errorMessage: null })
  },
}))
