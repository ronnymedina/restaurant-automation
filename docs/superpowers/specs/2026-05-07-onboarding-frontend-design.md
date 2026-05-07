# Onboarding Frontend — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Scope:** Fix `apps/ui/src/pages/onboarding.astro` to align with the backend contract and modularize into React components.

---

## Problem

The existing `onboarding.astro` has several mismatches with the backend API:

| Issue | Current (broken) | Correct |
|---|---|---|
| Demo data field | `skipProducts: true` | `createDemoData: true` |
| Response: restaurant name | `result.restaurant.name` | Not in response — use form state |
| Response: restaurant ID | `result.restaurant.id` | Not in response — remove |
| Response: product source | `result.source` | Not in response — remove |
| Response: email status | `result.emailSent` | Not in response — always show notice |
| Max file limit (UI text) | "Máximo 10 imágenes" | "Máximo 3 imágenes" (matches `MAX_FILES` default) |
| Frontend validation | None | Real-time email + restaurantName validation |

---

## Architecture

`onboarding.astro` remains as the layout shell and mounts a React wizard component via `client:load`.

```
apps/ui/src/
  pages/
    onboarding.astro              ← layout shell only, mounts OnboardingWizard
  components/
    onboarding/
      OnboardingWizard.tsx        ← step state, API call, step orchestration
      Step1Form.tsx               ← email + restaurantName inputs with real-time validation
      Step2Upload.tsx             ← drag & drop upload, file preview, demo skip
      Step3Success.tsx            ← confirmation screen
```

Shared state lives in `OnboardingWizard` and is passed down as props. The API call happens in `OnboardingWizard` so the result is available to `Step3Success`.

---

## Step 1 — `Step1Form.tsx`

**Fields:**
- Email (`type="email"`)
- Restaurant name (`type="text"`)

**Validation (real-time, on `input` + `blur`):**
- Email: standard format check (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Restaurant name: regex `/^[a-zA-ZÀ-ÿ \-_]+$/`, max 60 characters
- Error message shown inline below the field (not a toast)
- Character counter shown below restaurant name field (`N / 60`)

**Button behavior:**
- "Siguiente" is disabled until both fields pass validation
- On submit: passes `{ email, restaurantName }` up to `OnboardingWizard` and advances to step 2

---

## Step 2 — `Step2Upload.tsx`

**Upload area:**
- Drag & drop + click to select
- Accepts `image/jpeg`, `image/png` only
- Max 3 files enforced client-side (matches backend `MAX_FILES` default)
- File list preview with remove button per file

**Actions:**
- "Procesar Menú" (primary) — enabled only when ≥1 file selected; submits with photos
- "Saltar para Demo" (secondary) — submits with `createDemoData: true`, no photos
- "Volver" link — goes back to step 1

---

## Step 3 — `Step3Success.tsx`

**Receives as props:** `restaurantName`, `email`, `productsCreated`

**Info box (green background):**
- Restaurante: `restaurantName` (from form state)
- Email: `email` (from form state)
- Productos creados: `productsCreated` (from API response)

**Email notice (always shown, unconditional):**
- Title: "Revisa tu correo"
- Body: "Hemos enviado un enlace de activación a tu dirección de correo. Si no aparece en tu bandeja principal, revisa la carpeta de spam."

**Removed:** restaurant ID, product source label, conditional email error state.

---

## API Call — `OnboardingWizard.tsx`

**Endpoint:** `POST /v1/onboarding/register` (multipart/form-data)

**Demo path:**
```
email=...
restaurantName=...
createDemoData=true
```

**Photos path:**
```
email=...
restaurantName=...
photos=<file1>
photos=<file2>
...
```

**Response:** `{ productsCreated: number }` — only field read from response.

**Error handling:** existing `getErrorMessage(code)` from `src/lib/error-messages.ts` (unchanged).

---

## Out of Scope

- Changes to the backend API
- Changes to `activate.astro`
- Adding new onboarding steps
- Internationalización / i18n
