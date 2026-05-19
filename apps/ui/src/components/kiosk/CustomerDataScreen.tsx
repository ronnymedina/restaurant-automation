import React, { useState } from 'react'
import type { KioskTheme } from './types/kiosk.types'

type ContactResult = {
  email?: string
  phone?: string
  address?: string
  references?: string
}

type Props = {
  orderType: 'PICKUP' | 'DELIVERY'
  initialContact: string
  initialAddress: string
  initialReferences: string
  onConfirm: (data: ContactResult) => void
  onBack: () => void
  theme: KioskTheme
}

function detectContactType(value: string): 'email' | 'phone' {
  return value.includes('@') ? 'email' : 'phone'
}

export function CustomerDataScreen({
  orderType,
  initialContact,
  initialAddress,
  initialReferences,
  onConfirm,
  onBack,
  theme,
}: Props) {
  const [contact, setContact] = useState(initialContact)
  const [address, setAddress] = useState(initialAddress)
  const [references, setReferences] = useState(initialReferences)
  const [errors, setErrors] = useState<{ contact?: string; address?: string }>({})

  function handleConfirm() {
    const newErrors: { contact?: string; address?: string } = {}

    if (!contact.trim()) {
      newErrors.contact = 'Ingresa un teléfono o email de contacto'
    }
    if (orderType === 'DELIVERY' && !address.trim()) {
      newErrors.address = 'La dirección es requerida para envío a domicilio'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const type = detectContactType(contact.trim())
    onConfirm({
      email: type === 'email' ? contact.trim() : undefined,
      phone: type === 'phone' ? contact.trim() : undefined,
      address: orderType === 'DELIVERY' ? address.trim() : undefined,
      references: orderType === 'DELIVERY' && references.trim() ? references.trim() : undefined,
    })
  }

  const inputBase =
    'w-full px-4 py-3 md:py-4 border rounded-xl text-base focus:outline-none focus:ring-2'
  const ringStyle = { '--tw-ring-color': theme.primary, fontSize: '16px' } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-5">
        <h2 className="text-xl md:text-2xl font-bold text-center text-slate-800">
          {orderType === 'DELIVERY' ? 'Datos de entrega' : 'Datos de contacto'}
        </h2>

        <div>
          <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
            Teléfono o email{' '}
            <span style={{ color: theme.primary }}>*</span>
          </label>
          <input
            type="text"
            inputMode="text"
            value={contact}
            onChange={(e) => {
              setContact(e.target.value)
              setErrors((prev) => ({ ...prev, contact: undefined }))
            }}
            placeholder="Ej. 555-1234 o tu@email.com"
            className={`${inputBase} ${errors.contact ? 'border-red-400' : 'border-slate-300'}`}
            style={ringStyle}
          />
          {errors.contact && (
            <p className="text-red-500 text-sm mt-1">{errors.contact}</p>
          )}
        </div>

        {orderType === 'DELIVERY' && (
          <>
            <div>
              <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
                Dirección{' '}
                <span style={{ color: theme.primary }}>*</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  setErrors((prev) => ({ ...prev, address: undefined }))
                }}
                placeholder="Calle, número, colonia..."
                className={`${inputBase} ${errors.address ? 'border-red-400' : 'border-slate-300'}`}
                style={ringStyle}
              />
              {errors.address && (
                <p className="text-red-500 text-sm mt-1">{errors.address}</p>
              )}
            </div>

            <div>
              <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
                Referencias{' '}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="Ej. puerta azul, 2do piso..."
                className={`${inputBase} border-slate-300`}
                style={ringStyle}
              />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            ← Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  )
}
