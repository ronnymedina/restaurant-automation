-- Partial unique index: only one OPEN cash shift per restaurant.
-- Codifies the invariant that openSession relies on (audit H-45). Without
-- this, a race during openSession can create two OPEN shifts for the same
-- restaurant before the application-level check rejects the second one,
-- leaving an inconsistent state that survives reboots.
--
-- Prisma does not model partial indexes, so this migration lives as raw SQL.
-- The schema.postgresql.prisma comment continues to document the invariant.

-- Drop the older per-user variant if it still exists in any environment
-- (the index was renamed/scope-changed before this migration was authored).
DROP INDEX IF EXISTS "one_open_shift_per_user_per_restaurant";

-- Safety cleanup: in environments with pre-existing duplicate OPEN shifts
-- (typically dev/test DBs accumulated before the constraint existed),
-- close all but the most recent per restaurant so the partial unique index
-- can be created without violating the constraint. Prod DBs that have always
-- respected the app-level guard will touch 0 rows here.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "restaurantId"
      ORDER BY "openedAt" DESC, id DESC
    ) AS rn
  FROM "CashShift"
  WHERE status = 'OPEN'
)
UPDATE "CashShift"
SET status = 'CLOSED', "closedAt" = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "one_open_shift_per_restaurant"
  ON "CashShift" ("restaurantId")
  WHERE status = 'OPEN';
