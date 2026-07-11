# Fix Stale Prisma Client (CashShift/userId) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the Prisma client so `CashShift.userId` is reflected in the generated types, fix the TypeScript error, and verify both dev and production builds succeed.

**Architecture:** The `CashShift` model (with `userId`) was added to `schema.prisma` after the init migration — the generated Prisma client is stale. In dev we skip incremental migrations: `migrate reset --force` drops and recreates the full DB from the current schema, then we regenerate the client and verify both build modes.

**Tech Stack:** NestJS, Prisma 7, PostgreSQL, TypeScript, pnpm, Turborepo

---

### Task 1: Force-reset the database and sync the schema

**Files:**
- No code changes — schema is already correct

- [ ] **Step 1: Confirm schema is correct**

```bash
cd apps/api-core
grep -A 25 "model CashShift" prisma/schema.prisma
```

Expected output includes:
```
userId String
user   User   @relation(fields: [userId], references: [id])
restaurantId String
```

- [ ] **Step 2: Force-reset the database (drops all data, recreates from schema)**

```bash
cd apps/api-core
pnpm exec prisma migrate reset --force
```

Expected output:
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database ...

PostgreSQL schema "public" was successfully reset.
✔  The database is now in sync with your schema.
✔  Generated Prisma Client (v7.x.x) ...
```

> **Warning:** This drops all data in the dev database. Fine for local dev, never run on production.

---

### Task 2: Verify the Prisma client is up to date

**Files:**
- `node_modules/.prisma/client/` (auto-generated, not committed)

`migrate reset --force` regenerates the client automatically. This task confirms it's correct.

- [ ] **Step 1: Verify TypeScript no longer errors**

```bash
cd apps/api-core
pnpm exec tsc --noEmit 2>&1 | grep -i "cashshift\|cash-register"
```

Expected output: *(empty — no errors)*

---

### Task 3: Verify dev server compiles cleanly

**Files:**
- No changes

- [ ] **Step 1: Start the dev server in watch mode**

```bash
cd apps/api-core
pnpm run dev
```

Watch the output for ~10 seconds. Expected:
```
[HH:MM:SS] Starting compilation in watch mode...
[HH:MM:SS] Found 0 errors. Watching for file changes.
```

The old error was:
```
src/cash-register/cash-register-session.repository.ts:12:29 - error TS2353:
'userId' does not exist in type '...'
```

Confirm this line is **gone**. Then stop the server (`Ctrl+C`).

---

### Task 4: Verify production build succeeds

**Files:**
- No changes

- [ ] **Step 1: Run the production build**

```bash
cd apps/api-core
pnpm build
```

Expected output ends with:
```
Successfully compiled: X files with swc (... ms)
```

No TypeScript or Prisma errors.

- [ ] **Step 2: Commit clean state**

```bash
cd apps/api-core
git add -p   # confirm no unexpected changes
git commit -m "fix(prisma): regenerate client with CashShift userId field" --allow-empty
```

Use `--allow-empty` only if there are no file changes (the generated client is in node_modules and not committed). Skip this step if nothing to commit.

---

### Task 5: Run unit and e2e tests

**Files:**
- No changes

- [ ] **Step 1: Run unit tests**

```bash
cd apps/api-core
pnpm test 2>&1 | tail -20
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run e2e tests**

```bash
cd apps/api-core
pnpm test:e2e 2>&1 | tail -20
```

Expected: all tests pass, 0 failures.

If e2e tests fail due to database state (not due to the Prisma change), that is a pre-existing issue — document it but do not block this fix.
