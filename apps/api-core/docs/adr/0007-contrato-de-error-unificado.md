# ADR 0007 — Contrato de error unificado de la API

**Estado:** Aceptado
**Fecha:** 2026-06-14

## Contexto

La API devolvía errores con **dos formas distintas** según su origen, lo que impedía al frontend
mapearlos de forma consistente:

- **Excepciones de dominio** (`BaseException` y subclases): body
  `{ message: string, code, statusCode, details? }` — con un `code` estable.
- **Errores de validación de DTO** (`ValidationPipe` global, sin `exceptionFactory`): body por
  defecto de NestJS `{ message: string[], error: "Bad Request", statusCode }` — **sin `code`** y
  con un campo `error` que las excepciones custom no tienen.

Verificado empíricamente contra el backend en ejecución:

```jsonc
// Validación (antes): sin code, con "error"
{ "message": ["El email debe ser válido"], "error": "Bad Request", "statusCode": 400 }
// Custom: con code, sin "error"
{ "message": "Origin or Referer header is required for this request", "code": "ORIGIN_REQUIRED", "statusCode": 403 }
```

Consecuencia: el frontend no podía clasificar los errores de validación por `code` (caían al
mensaje genérico), y el `message` cambiaba de tipo (`string` vs `string[]`) según el origen.

## Decisión

Unificar **todas** las respuestas de error bajo una sola forma:

```jsonc
{
  "message": string[],   // SIEMPRE array. Validación → N mensajes; custom → 1 elemento
  "code": string,        // SIEMPRE presente
  "statusCode": number,
  "details"?: object     // opcional, solo cuando la excepción lo provee
}
```

Reglas:

1. **`BaseException`** envuelve su `message` en un array de un elemento (`[message]`).
2. Un **`exceptionFactory` global** en el `ValidationPipe` (`main.ts`) emite
   `{ message: string[], code: 'VALIDATION_ERROR', statusCode: 400 }`, tomando el control del body
   (se elimina el `error: "Bad Request"` de NestJS). Vive en
   `src/common/validation-exception.factory.ts` con test unitario.
3. **Mensajes técnicos en inglés** por defecto. El texto **friendly en español** es responsabilidad
   del **frontend**, mapeado por `code` (`apps/ui/src/lib/error-messages.ts`).
4. El cliente clasifica por **`code` + `statusCode`**, no por el texto de `message`.

El cambio es **aditivo en lo esencial**: a validación solo se le agrega `code` (y se le quita
`error`); a las custom solo se les cambia `message` de `string` a `string[]`.

## Consecuencias positivas

- Contrato de error consistente en toda la API; el frontend mapea siempre por `code`.
- `message` con tipo estable (`string[]`), elimina ramas condicionales en el cliente.
- Catálogo de errores documentado por módulo (ver `onboarding-error-mapping.md`).
- Punto único de cambio para validación (`exceptionFactory`).

## Consecuencias negativas

- Cambia el contrato de error **de toda la API**: tests e2e que asertaban `message` como string
  debieron migrar a array (ej. `products.e2e-spec.ts`).
- `message` deja de ser legible directamente para humanos sin el frontend (queda en inglés y como
  array); se acepta porque la presentación es responsabilidad del cliente.

## Alternativas consideradas

- **Solo documentar y manejar en el frontend** (sin tocar el backend): el cliente interpretaría la
  forma default de NestJS. Descartada: deja la validación sin `code`, inconsistente con el resto.
- **Acotar el cambio solo al onboarding**: descartada por incoherencia con el resto de la API.
- **`details.errors` por campo** en validación: descartada por YAGNI (duplicaría el `message[]`
  plano); se puede estructurar más adelante sin otro cambio de backend si se necesita marcar campos
  específicos en la UI.
- **Normalizar `message` a string en ambas familias**: descartada porque perdería la lista de
  mensajes de validación.

## Referencias

- `apps/api-core/src/common/base.exception.ts` — `message` como array.
- `apps/api-core/src/common/validation-exception.factory.ts` — factory de validación.
- `apps/api-core/src/main.ts` — wiring del `exceptionFactory`.
- `apps/api-core/docs/onboarding-error-mapping.md` — catálogo de códigos.
- `apps/ui/src/lib/error-messages.ts` — mapeo friendly (ES) por `code`.
