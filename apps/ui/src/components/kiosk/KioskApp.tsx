import { useEffect, useMemo } from 'react'
import { useKioskStore } from './store/kiosk.store'
import type { KioskTheme } from './types/kiosk.types'
import { KioskView } from './types/kiosk.types'
import { LoadingScreen } from './LoadingScreen'
import { SessionClosedScreen } from './SessionClosedScreen'
import { KioskHeader } from './KioskHeader'
import { MenuTabs } from './MenuTabs'
import { ProductGrid } from './ProductGrid'
import { CartFab } from './CartFab'
import { CartPanel } from './CartPanel'
import { OrderConfirmation } from './OrderConfirmation'
import { PaymentMethodSelector } from './PaymentMethodSelector'

const defaultTheme: KioskTheme = {
  primary: '#059669',
  primaryDark: '#047857',
  accent: '#d97706',
  background: '#fffbeb',
  surface: '#ffffff',
  text: '#1e293b',
  textMuted: '#94a3b8',
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <div className="fixed top-4 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-center font-medium">
      {message}
    </div>
  )
}

type Props = {
  theme?: Partial<KioskTheme>
}

export function KioskApp({ theme: themeProp }: Props) {
  const theme = { ...defaultTheme, ...themeProp }

  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get('slug') ?? '',
    [],
  )

  const isLoading = useKioskStore(s => s.isLoading)
  const sessionOpen = useKioskStore(s => s.sessionOpen)
  const menus = useKioskStore(s => s.menus)
  const activeMenuId = useKioskStore(s => s.activeMenuId)
  const menuSections = useKioskStore(s => s.menuSections)
  const cart = useKioskStore(s => s.cart)
  const view = useKioskStore(s => s.view)
  const confirmedOrder = useKioskStore(s => s.confirmedOrder)
  const errorMessage = useKioskStore(s => s.errorMessage)
  const selectedPayment = useKioskStore(s => s.selectedPayment)
  const customerEmail = useKioskStore(s => s.customerEmail)
  const isSubmitting = useKioskStore(s => s.isSubmitting)

  const init = useKioskStore(s => s.init)
  const selectMenu = useKioskStore(s => s.selectMenu)
  const addToCart = useKioskStore(s => s.addToCart)
  const setView = useKioskStore(s => s.setView)
  const setPayment = useKioskStore(s => s.setPayment)
  const setCustomerEmail = useKioskStore(s => s.setCustomerEmail)
  const placeOrder = useKioskStore(s => s.placeOrder)
  const resetOrder = useKioskStore(s => s.resetOrder)
  const clearError = useKioskStore(s => s.clearError)

  useEffect(() => {
    if (slug) init(slug)
  }, [slug, init])

  if (!slug) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
        <p style={{ color: theme.textMuted }}>Restaurante no especificado</p>
      </div>
    )
  }

  if (isLoading) {
    return <LoadingScreen theme={theme} />
  }

  if (!sessionOpen) {
    return <SessionClosedScreen theme={theme} />
  }

  if (view === KioskView.CONFIRMATION && confirmedOrder) {
    return (
      <OrderConfirmation
        orderNumber={confirmedOrder.orderNumber}
        items={confirmedOrder.items}
        total={confirmedOrder.totalAmount}
        onNewOrder={resetOrder}
        theme={theme}
      />
    )
  }

  if (view === KioskView.CHECKOUT) {
    return (
      <PaymentMethodSelector
        selectedMethod={selectedPayment}
        onSelect={setPayment}
        customerEmail={customerEmail}
        onEmailChange={setCustomerEmail}
        onConfirm={placeOrder}
        onBack={() => setView(KioskView.CART)}
        isLoading={isSubmitting}
        theme={theme}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: theme.background, color: theme.text }}>
      <KioskHeader
        title={menus.find(m => m.id === activeMenuId)?.name ?? 'Menú'}
        theme={theme}
      />
      <MenuTabs
        menus={menus}
        activeMenuId={activeMenuId}
        onSelect={selectMenu}
        theme={theme}
      />
      <main className="flex-1 overflow-y-auto p-4">
        {activeMenuId && menuSections[activeMenuId]
          ? <ProductGrid
              sections={menuSections[activeMenuId]}
              onAddItem={addToCart}
              theme={theme}
            />
          : <div className="text-center text-slate-400 py-12">Selecciona un menú para ver los productos</div>
        }
      </main>

      {view === KioskView.MENU && (
        <CartFab
          itemCount={cart.reduce((s, c) => s + c.quantity, 0)}
          onClick={() => setView(KioskView.CART)}
          theme={theme}
        />
      )}

      {view === KioskView.CART && (
        <CartPanel
          onClose={() => setView(KioskView.MENU)}
          onCheckout={() => setView(KioskView.CHECKOUT)}
          theme={theme}
        />
      )}

      {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
    </div>
  )
}
