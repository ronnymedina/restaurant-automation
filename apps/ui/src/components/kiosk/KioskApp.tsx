import { useEffect, useMemo } from 'react'
import { useKioskStore } from './store/kiosk.store'
import type { KioskTheme } from './types/kiosk.types'
import { KioskView } from './types/kiosk.types'
import { useViewport } from './hooks/useViewport'
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
  primary: '#f97316',
  primaryDark: '#ea6c0a',
  accent: '#f97316',
  background: '#fafaf8',
  surface: '#ffffff',
  text: '#111',
  textMuted: '#555',
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
  const { isSidebarMode } = useViewport()

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
  const restaurantName = useKioskStore(s => s.restaurantName)

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

  if (isLoading) return <LoadingScreen theme={theme} />

  if (!sessionOpen) return <SessionClosedScreen theme={theme} restaurantName={restaurantName} />

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
      <>
        <PaymentMethodSelector
          selectedMethod={selectedPayment}
          onSelect={setPayment}
          customerEmail={customerEmail}
          onEmailChange={setCustomerEmail}
          onConfirm={placeOrder}
          onBack={() => setView(isSidebarMode ? KioskView.MENU : KioskView.CART)}
          isLoading={isSubmitting}
          theme={theme}
        />
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </>
    )
  }

  const menuContent = activeMenuId && menuSections[activeMenuId]
    ? <ProductGrid sections={menuSections[activeMenuId]} onAddItem={addToCart} theme={theme} />
    : <div className="text-center text-slate-400 py-12">Selecciona un menú para ver los productos</div>

  const headerTitle = menus.find(m => m.id === activeMenuId)?.name ?? 'Menú'

  if (isSidebarMode) {
    return (
      <div className="h-dvh flex flex-row" style={{ backgroundColor: theme.background, color: theme.text }}>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <KioskHeader title={headerTitle} restaurantName={restaurantName} theme={theme} />
          <MenuTabs menus={menus} activeMenuId={activeMenuId} onSelect={selectMenu} theme={theme} />
          <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 md:p-6">
            {menuContent}
          </main>
        </div>
        <div className="w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col">
          <CartPanel
            variant="sidebar"
            onClose={() => {}}
            onCheckout={() => setView(KioskView.CHECKOUT)}
            theme={theme}
          />
        </div>
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </div>
    )
  }

  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0)

  return (
    <div className="h-dvh flex flex-col" style={{ backgroundColor: theme.background, color: theme.text }}>
      <KioskHeader title={headerTitle} restaurantName={restaurantName} theme={theme} />
      <MenuTabs menus={menus} activeMenuId={activeMenuId} onSelect={selectMenu} theme={theme} />
      <main className={`flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 ${view === KioskView.MENU && cartItemCount > 0 ? 'pb-28' : ''}`}>
        {menuContent}
      </main>
      {view === KioskView.MENU && (
        <CartFab
          itemCount={cartItemCount}
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
