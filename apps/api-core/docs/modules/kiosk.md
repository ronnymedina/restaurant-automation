# Kiosk Module

Public-facing API for the self-service kiosk. Most endpoints are unauthenticated and identified by restaurant slug.

## Authentication
No JWT required. Restaurant identified via `slug` URL parameter.

## Endpoints
| Method | Path | Body | Response |
|---|---|---|---|
| GET | /v1/kiosk/:slug/menus | — | Menu[] (active, filtered by day/time) |
| GET | /v1/kiosk/:slug/menus/:menuId/items | — | { menuId, menuName, sections } |
| GET | /v1/kiosk/:slug/status | — | { registerOpen: boolean } |
| POST | /v1/kiosk/:slug/orders | CreateOrderDto | Order |

## Get Menu Items Flow

```mermaid
sequenceDiagram
    participant Client as Kiosk Client
    participant C as KioskController
    participant S as KioskService
    participant MR as MenuRepository

    Client->>C: GET /kiosk/:slug/menus/:menuId/items
    C->>S: getMenuItems(slug, menuId)
    S->>S: resolveRestaurant(slug)
    S->>MR: findByIdWithItems(menuId, restaurantId)
    MR-->>S: Menu with items
    S->>S: buildSections(items)
    S-->>C: { menuId, menuName, sections }
    C-->>Client: sections grouped by sectionName
```

## Stock Status Logic

```mermaid
flowchart TD
    A[effectiveStock = item.stock ?? product.stock] --> B{effectiveStock is null?}
    B -- Yes --> C[AVAILABLE / infinite stock]
    B -- No --> D{effectiveStock <= 0?}
    D -- Yes --> E[OUT_OF_STOCK]
    D -- No --> F{effectiveStock <= 3?}
    F -- Yes --> G[LOW_STOCK]
    F -- No --> H[AVAILABLE]
```
