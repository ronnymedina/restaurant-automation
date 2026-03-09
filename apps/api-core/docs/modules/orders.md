# Orders Module

Manages customer orders. Orders are created through the Kiosk module and managed via the dashboard.

## Authentication
All endpoints require JWT Bearer token.

## Roles
| Operation | Allowed Roles |
|---|---|
| GET | ADMIN, MANAGER, BASIC |
| PATCH (status, pay, cancel) | ADMIN, MANAGER |

## Endpoints
| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | /v1/orders | — | Order[] | ADMIN, MANAGER, BASIC |
| GET | /v1/orders/:id | — | Order | ADMIN, MANAGER, BASIC |
| PATCH | /v1/orders/:id/status | UpdateOrderStatusDto | Order | ADMIN, MANAGER |
| PATCH | /v1/orders/:id/pay | — | Order | ADMIN, MANAGER |
| PATCH | /v1/orders/:id/cancel | CancelOrderDto | Order | ADMIN, MANAGER |

## Order Status Transitions

```mermaid
stateDiagram-v2
    [*] --> CREATED: createOrder
    CREATED --> PROCESSING: updateStatus
    PROCESSING --> COMPLETED: updateStatus (requires isPaid=true)
    CREATED --> CANCELLED: cancelOrder
    PROCESSING --> CANCELLED: cancelOrder
    COMPLETED --> [*]
    CANCELLED --> [*]
```

## Create Order Flow

```mermaid
sequenceDiagram
    participant K as KioskService
    participant S as OrdersService
    participant DB as PrismaTransaction

    K->>S: createOrder(restaurantId, sessionId, dto)
    S->>DB: validateAndBuildItems()
    DB-->>S: orderItems, stockEntries, totalAmount
    S->>S: validateExpectedTotal()
    S->>DB: decrementAllStock()
    S->>DB: persistOrder()
    DB-->>S: Order
    S->>S: emitOrderCreated()
    S-->>K: Order
```
