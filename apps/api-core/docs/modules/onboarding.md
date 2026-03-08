# Módulo: Onboarding

**Location:** `apps/api-core/src/onboarding`
**Autenticación requerida:** No (público)
**Versión:** v1

---

## Descripción

Módulo encargado de registrar un nuevo restaurante por primera vez. Crea el restaurante, el usuario administrador (rol `MANAGER`, inactivo), la categoría por defecto y opcionalmente los productos iniciales. Envía el email de activación al finalizar todo el proceso.

---

## Endpoint

### `POST /v1/onboarding/register`

**Content-Type:** `multipart/form-data`

#### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string (email) | Sí | Email del usuario. Se enviará el link de activación. |
| `restaurantName` | string | Sí | Nombre del restaurante. Máx. 60 caracteres. Solo letras, acentos, espacios, guión medio y guión bajo. |
| `createDemoData` | boolean | No | Si `true`, crea 5 productos demo y un menú activo con secciones. |
| `photos` | File[] (PNG/JPG) | No | Fotos del menú para extracción de productos via IA. Máx. 3 archivos, máx. 5MB c/u. |

#### Validaciones del DTO

- `email`: formato email válido, requerido.
- `restaurantName`: requerido, máx. 60 caracteres, regex `/^[a-zA-ZÀ-ÿ \-_]+$/` (letras, acentos, espacios, guión medio, guión bajo).
- `createDemoData`: booleano opcional. En `multipart/form-data` acepta el string `"true"` o `"false"` y lo convierte automáticamente.
- `photos`: validados por `ParseFilePipe` antes de llegar al servicio. Si el archivo no es PNG o JPG, o supera el tamaño máximo, se rechaza la petición con `400` antes de ejecutar ningún flujo de negocio.

---

## Flujo principal

```mermaid
flowchart TD
    A([POST /v1/onboarding/register]) --> B{¿Email ya existe?}
    B -- Sí --> ERR1[409 EMAIL_ALREADY_EXISTS]
    B -- No --> C[Crear restaurante]
    C -- Error --> ERR2[500 RESTAURANT_CREATION_FAILED]
    C -- OK --> D[Crear usuario\nMANAGER · inactivo · activationToken]
    D -- Error --> ERR3[500 USER_CREATION_FAILED]
    D -- OK --> E[Crear categoría default]
    E -- Error --> ERR4[500 ONBOARDING_FAILED]
    E -- OK --> F{¿Tiene photos?}
    F -- Sí --> G[Flujo extracción IA]
    F -- No --> H{¿createDemoData?}
    H -- true --> I[Flujo demo]
    H -- false --> J[0 productos]
    G --> K[Enviar email activación\n⚠ no bloqueante]
    I --> K
    J --> K
    K --> L([201 · productsCreated])

    style ERR1 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR4 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style K fill:#fef9c3,stroke:#eab308,color:#713f12
    style L fill:#dcfce7,stroke:#22c55e,color:#14532d
```

> El email se envía únicamente cuando todas las operaciones de base de datos han finalizado exitosamente.

---

## Sub-flujos de productos

### Con `photos` (extracción IA)

```mermaid
flowchart TD
    A([Fotos recibidas]) --> B[Enviar a Gemini AI]
    B -- Error de API --> C[Log error\ncontinúa con 0 productos]
    B -- OK --> D{¿Productos extraídos?}
    D -- Lista vacía --> E[0 productos]
    D -- Con resultados --> F[Filtrar precio > 0]
    F --> G{¿Quedan válidos?}
    G -- No --> H[0 productos]
    G -- Sí --> I[createProductsBatch\nen lotes]
    I --> J([productsCreated = N])

    C --> J2([productsCreated = 0])
    E --> J2
    H --> J2

    style C fill:#fef9c3,stroke:#eab308,color:#713f12
    style J fill:#dcfce7,stroke:#22c55e,color:#14532d
    style J2 fill:#f1f5f9,stroke:#94a3b8,color:#475569
```

La falla en la extracción de fotos **no detiene el onboarding**. El restaurante y el usuario quedan creados.

### Con `createDemoData: true` (demo)

```mermaid
flowchart TD
    A([createDemoData = true]) --> B[Crear 5 productos demo\nen categoría default]
    B --> C[Crear menú activo\nMenú Principal]
    C --> D[bulkCreateItems\nPlatos Principales\nproductos 1-2-3]
    D --> E[bulkCreateItems\nBebidas\nproductos 4-5]
    E --> F([productsCreated = 5])

    B -- Error --> ERR[500 ONBOARDING_FAILED]

    subgraph productos [5 productos demo]
        P1[Hamburguesa Clásica · $8.99]
        P2[Pizza Margherita · $10.50]
        P3[Pasta Carbonara · $9.75]
        P4[Limonada Natural · $3.50]
        P5[Agua Mineral · $1.50]
    end

    subgraph menu [Menú Principal]
        S1[Platos Principales\nP1 · P2 · P3]
        S2[Bebidas\nP4 · P5]
    end

    style F fill:#dcfce7,stroke:#22c55e,color:#14532d
    style ERR fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
```

### Sin fotos y sin `createDemoData`

```mermaid
flowchart LR
    A([Sin fotos\ncreateDemoData = false]) --> B([productsCreated = 0])
    style B fill:#f1f5f9,stroke:#94a3b8,color:#475569
```

---

## Respuesta

**HTTP 201 Created**

```json
{
  "productsCreated": 5
}
```

Solo se expone `productsCreated`. No se retorna el ID del restaurante, ID del usuario, tokens ni información sensible.

---

## Códigos de error

| Código | Error code | Descripción |
|--------|-----------|-------------|
| 400 | — | Datos inválidos, tipo de archivo incorrecto o tamaño excedido |
| 409 | `EMAIL_ALREADY_EXISTS` | El email ya está registrado |
| 500 | `RESTAURANT_CREATION_FAILED` | Error al crear el restaurante |
| 500 | `USER_CREATION_FAILED` | Error al crear el usuario |
| 500 | `ONBOARDING_FAILED` | Error inesperado en el proceso |

---

## Dependencias de módulos

| Módulo | Uso |
|--------|-----|
| `RestaurantsModule` | Crear el restaurante |
| `UsersModule` | Validar email y crear usuario |
| `ProductsModule` | Crear categoría default y productos |
| `MenusModule` | Crear menú y menu items (flujo demo) |
| `AiModule` | Extraer productos desde imágenes (Gemini) |
| `EmailModule` | Enviar email de activación |

---

## Notas de diseño

- **Transaccionalidad parcial:** No existe una transacción global porque el envío de email es una operación externa. Las operaciones de base de datos son secuenciales. Si una falla, las anteriores quedan confirmadas (sin rollback automático). Para un MVP esto es aceptable; en versiones futuras se puede evaluar una estrategia de compensación o saga.
- **Extracción de fotos no bloqueante:** Una falla en Gemini no debe impedir que el restaurante quede registrado. Se loguea el error y el flujo continúa.
- **Email al final:** El email se envía después de todas las operaciones de DB para garantizar que el usuario solo recibe el link si el registro fue exitoso.
- **Respuesta minimalista:** El controller tiene su propio tipo `OnboardingResponse` que serializa únicamente los campos necesarios para el frontend.
