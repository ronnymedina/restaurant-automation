# Products Module

Manages products for a restaurant. Products belong to a category and can have finite or infinite stock.

## Authentication
All endpoints require JWT Bearer token.

## Roles
| Operation | Allowed Roles |
|---|---|
| GET | ADMIN, MANAGER, BASIC |
| POST, PATCH, DELETE | ADMIN, MANAGER |

## Endpoints
| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | /v1/products | — | PaginatedResult\<Product\> | ADMIN, MANAGER, BASIC |
| GET | /v1/products/:id | — | Product | ADMIN, MANAGER, BASIC |
| POST | /v1/products | CreateProductDto | Product | ADMIN, MANAGER |
| PATCH | /v1/products/:id | UpdateProductDto | Product | ADMIN, MANAGER |
| DELETE | /v1/products/:id | — | Product | ADMIN, MANAGER |

## Create Product Flow

```mermaid
sequenceDiagram
    participant C as ProductsController
    participant S as ProductsService
    participant R as ProductRepository
    participant E as ProductEventsService

    C->>S: createProduct(restaurantId, data, categoryId)
    S->>R: create(data)
    R-->>S: Product
    S->>E: emitProductCreated(restaurantId)
    E-->>S: void
    S-->>C: Product
```

## Decrement Stock Flow

```mermaid
flowchart TD
    A[decrementStock called] --> B{Product found?}
    B -- No --> C[throw EntityNotFoundException]
    B -- Yes --> D{stock is null?}
    D -- Yes --> E[return product unchanged / infinite stock]
    D -- No --> F{stock < amount?}
    F -- Yes --> G[throw InsufficientStockException]
    F -- No --> H[update stock = stock - amount]
    H --> I[return updated Product]
```
