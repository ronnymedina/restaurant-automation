# Reservations Module — Design Spec
_Date: 2026-03-14_

## Overview

Add table and reservation management to the restaurant platform. Staff (ADMIN, MANAGER) can define the restaurant's physical tables and create/manage reservations from the dashboard. Availability is validated in real time against table capacity and time overlap.

---

## Data Model

### Restaurant (field addition)
```prisma
defaultReservationDuration  Int  @default(90)  // minutes
```

### Table
```prisma
model Table {
  id           String        @id @default(uuid())
  name         String        // "Mesa 1", "Terraza A"
  capacity     Int           // number of seats
  active       Boolean       @default(true)

  restaurantId String
  restaurant   Restaurant    @relation(fields: [restaurantId], references: [id])
  reservations Reservation[]

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([restaurantId])
}
```

### ReservationStatus enum
```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  SEATED
  COMPLETED
  NO_SHOW
  CANCELLED
}
```

### Reservation
```prisma
model Reservation {
  id           String            @id @default(uuid())
  guestName    String
  guestPhone   String
  guestEmail   String?           // optional — used for confirmation email
  partySize    Int
  date         DateTime          // reservation start (date + time)
  duration     Int               // minutes — copied from restaurant default at creation time
  status       ReservationStatus @default(PENDING)
  notes        String?

  // Payment
  isPaid           Boolean  @default(false)
  paymentReference String?  // e.g. "MP-123456", "pi_abc123"
  paymentPlatform  String?  // e.g. "MercadoPago", "Stripe", "Efectivo"

  cancellationReason String?

  tableId      String
  table        Table             @relation(fields: [tableId], references: [id])
  restaurantId String
  restaurant   Restaurant        @relation(fields: [restaurantId], references: [id])

  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  @@index([restaurantId, date])
  @@index([tableId, date])
}
```

### Status transitions
```
PENDING → CONFIRMED → SEATED → COMPLETED
                             ↘ NO_SHOW
           ↘ CANCELLED (from any active status)
```

---

## Backend Architecture

### Module: `tables`

**File structure:**
```
src/tables/
├── README.md
├── tables.module.ts
├── tables.controller.ts
├── tables.service.ts
├── tables.repository.ts
├── dto/
│   ├── create-table.dto.ts
│   ├── update-table.dto.ts
│   └── table.dto.ts
└── exceptions/
    └── tables.exceptions.ts
```

**Endpoints** — roles: ADMIN, MANAGER

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/tables` | List restaurant tables |
| `POST` | `/v1/tables` | Create table |
| `PATCH` | `/v1/tables/:id` | Update name / capacity / active |
| `DELETE` | `/v1/tables/:id` | Delete table (only if no future reservations) |

---

### Module: `reservations`

**File structure:**
```
src/reservations/
├── README.md
├── reservations.module.ts
├── reservations.controller.ts
├── reservations.service.ts
├── reservations.repository.ts
├── dto/
│   ├── create-reservation.dto.ts
│   ├── update-reservation.dto.ts
│   └── reservation.dto.ts
└── exceptions/
    └── reservations.exceptions.ts
```

**Endpoints** — roles: ADMIN, MANAGER

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/v1/reservations` | List reservations (filters: date, status, tableId) |
| `POST` | `/v1/reservations` | Create reservation with full validation |
| `PATCH` | `/v1/reservations/:id` | Edit data or change status |
| `DELETE` | `/v1/reservations/:id` | Cancel reservation |

---

### Validation on reservation creation (ordered)

1. **Table exists and belongs to restaurant** — `NotFoundException` if not
2. **Table is active** — `BadRequestException` if not
3. **Capacity check** — `table.capacity >= partySize`, else exception with clear message
4. **Time overlap check** — query reservations on same table where `status NOT IN [CANCELLED, NO_SHOW, COMPLETED]` and time range `[date, date + duration minutes]` overlaps with new reservation. Conflict throws exception with the conflicting time.
5. **Email (fire-and-forget)** — if `guestEmail` present and email provider configured, send confirmation without blocking response.

### `duration` field behavior
Copied from `restaurant.defaultReservationDuration` at creation time. Changes to the restaurant default do not affect existing reservations.

### Restaurant settings
`defaultReservationDuration` is updated via the existing restaurant update endpoint (add field to update DTO).

---

## Dashboard UI

### `/dash/tables`
- Table listing: name, capacity, active status
- Inline form: create / edit table (name + capacity)
- Delete action: blocked if table has future reservations

### `/dash/reservations`
- **Filters:** date (default: today), status, table
- **List:** ordered by time — columns: time, table, guest name, party size, status, paid
- **Actions per row:** change status, edit, cancel
- **New reservation form:**
  - Table selector (shows name + capacity)
  - Date + time
  - Party size
  - Guest name + phone + email (optional)
  - Notes (optional)
  - Paid toggle → if yes: payment reference + platform fields

### `/dash/settings` (existing page or new)
- Field: "Duración estimada por reserva (minutos)"

---

## Out of scope (MVP)
- Customer self-service booking (storefront)
- Table combination / merging
- Recurring reservations
- SMS notifications
- Waitlist management
