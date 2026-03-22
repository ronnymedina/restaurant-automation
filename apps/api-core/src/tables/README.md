# Tables Module

Manages the physical tables in a restaurant.

## Endpoints (ADMIN, MANAGER)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /v1/tables | List restaurant tables |
| POST | /v1/tables | Create table |
| PATCH | /v1/tables/:id | Update name / capacity / active |
| DELETE | /v1/tables/:id | Delete table (blocked if future reservations exist) |
