# Reservations Module

Manages table reservations for the restaurant.

## Endpoints (ADMIN, MANAGER)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /v1/reservations | List reservations (filters: date, status, tableId) |
| POST | /v1/reservations | Create reservation with full validation |
| PATCH | /v1/reservations/:id | Edit data or change status |
| DELETE | /v1/reservations/:id | Cancel reservation |

## Validation on creation (ordered)
1. Table exists and belongs to restaurant
2. Table is active
3. Party size ≤ table capacity
4. No time overlap with existing active reservations
5. Fire-and-forget email stub (extend when email template is ready)

## Status transitions
PENDING → CONFIRMED → SEATED → COMPLETED
                              ↘ NO_SHOW
           ↘ CANCELLED (from any active status)
