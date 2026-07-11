# Spec: Onboarding — Resend Activation Email

**Date:** 2026-05-08
**Module:** `onboarding`

## Problem

When email is not configured or the activation email fails to arrive, the user cannot re-register because `POST /v1/onboarding/register` returns 409 `EMAIL_ALREADY_EXISTS` — even though the account is inactive and was never confirmed.

## Solution

Add a dedicated `POST /v1/onboarding/resend-activation` endpoint that allows an unactivated user to request a new activation email, with rate limiting per email address.

## Endpoint

**`POST /v1/onboarding/resend-activation`**

- Auth: public (`@Public()`)
- Content-Type: `application/json`
- Rate limit: 3 requests per email per 15 minutes (custom throttler guard)

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `email` | string | ✅ | valid email |

### Responses

| Case | Status | Code |
|---|---|---|
| Email sent successfully | 200 | — |
| User not found | 404 | `USER_NOT_FOUND` |
| User already active | 409 | `USER_ALREADY_ACTIVE` |
| Rate limit exceeded | 429 | — |

### Response body (200)

```json
{ "message": "Activation email sent" }
```

## Internal flow

1. Look up user by email via `UsersService.findByEmail()`
2. If not found → throw `UserNotFoundException` (404)
3. If found and `isActive: true` → throw `UserAlreadyActiveException` (409)
4. If found and `isActive: false`:
   - Generate a new `activationToken` (UUID) — invalidates any previous token
   - Persist the new token via `UsersService.refreshActivationToken(userId, token)`
   - Send activation email via `EmailService.sendActivationEmail()` (silent failure — does not block response)
   - Return 200

## Rate limiting

The standard `ThrottlerGuard` limits by IP. Since an attacker could spam a specific email from multiple IPs, this endpoint uses a **custom `EmailThrottlerGuard`** that overrides `getTracker()` to use the email from the request body as the throttle key.

- Limit: 3 requests per 900 000 ms (15 min) per email
- Guard class: `EmailThrottlerGuard` — lives in `onboarding/guards/email-throttler.guard.ts`
- Applied with `@UseGuards(EmailThrottlerGuard)` + `@Throttle({ default: { ttl: 900_000, limit: 3 } })`

## New exceptions (`onboarding.exceptions.ts`)

| Class | Status | Code |
|---|---|---|
| `UserNotFoundException` | 404 | `USER_NOT_FOUND` |
| `UserAlreadyActiveException` | 409 | `USER_ALREADY_ACTIVE` |

## New method (`UsersService`)

```ts
refreshActivationToken(userId: string, token: string): Promise<User>
```

Updates `activationToken` on the user record. Delegates to `UserRepository.update()`.

## Changes summary

| File | Change |
|---|---|
| `onboarding/dto/resend-activation.dto.ts` | New DTO with `email` field |
| `onboarding/guards/email-throttler.guard.ts` | New custom throttler guard keyed by email |
| `onboarding/onboarding.controller.ts` | Add `POST resend-activation` action |
| `onboarding/onboarding.service.ts` | Add `resendActivation(email)` method |
| `onboarding/exceptions/onboarding.exceptions.ts` | Add `UserNotFoundException`, `UserAlreadyActiveException` |
| `users/users.service.ts` | Add `refreshActivationToken()` method |
| `onboarding/onboarding.service.spec.ts` | Unit tests for new method |
| `test/onboarding/resend-activation.e2e-spec.ts` | E2E tests |
| `onboarding/onboarding.module.info.md` | Update module documentation |

## Tests

### Unit (`onboarding.service.spec.ts`)

- Email does not exist → throws `UserNotFoundException`
- User exists and is active → throws `UserAlreadyActiveException`
- User exists and is inactive → regenerates token, sends email, returns void
- Email service failure → does not throw (silent)

### E2E (`test/onboarding/resend-activation.e2e-spec.ts`)

- Valid inactive user → 200
- Unknown email → 404
- Already active user → 409
- 4th request same email within 15 min → 429
