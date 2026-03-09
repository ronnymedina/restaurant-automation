# Diseño: Refactor General de Módulos API Core

**Fecha:** 2026-03-08
**Estado:** Aprobado

> Documento de diseño para el plan de implementación. Ver también `docs/adr/2026-03-08-refactor-modules-design.md`.

## Arquitectura General

```
src/
├── config.ts                          ← agregar DEFAULT_CATEGORY_NAME
├── events/
│   ├── events.gateway.ts              (existente)
│   ├── events.module.ts               (existente)
│   ├── products.events.ts             (nuevo)
│   ├── orders.events.ts               (nuevo)
│   └── kiosk.events.ts                (nuevo)
├── common/
│   └── guards/
│       └── restaurant-resource.guard.ts  (nuevo)
├── products/
│   ├── products.service.ts            ← usar ProductEventsService, DEFAULT_CATEGORY_NAME
│   ├── products.controller.ts         ← return types explícitos
│   ├── categories.controller.ts       ← return types, BASIC=GET only
│   └── exceptions/products.exceptions.ts ← nuevo InsufficientStockException
├── restaurants/
│   └── restaurants.controller.ts      (nuevo)
├── kiosk/
│   └── kiosk.service.ts               ← const as const, split getMenuItems
└── orders/
    ├── orders.service.ts              ← split createOrder, enum over strings
    └── orders.controller.ts           ← return types, OrderEventsService
```

## Decisiones Clave

1. **Eventos centralizados** en `src/events/` — servicios por módulo con constantes `as const`
2. **Guard NestJS** para validar ownership de recursos — `RestaurantResourceGuard`
3. **`DEFAULT_CATEGORY_NAME`** en `config.ts`
4. **`Role.BASIC`** solo puede hacer GET en todos los controllers

## Orden de Implementación

1. `src/events/` — productos, órdenes, kiosk events
2. `src/common/guards/` — `RestaurantResourceGuard`
3. `src/config.ts` — constantes
4. Módulo `products`
5. Módulo `restaurants`
6. Módulo `kiosk`
7. Módulo `orders`
8. Tests, docs, swagger por módulo
