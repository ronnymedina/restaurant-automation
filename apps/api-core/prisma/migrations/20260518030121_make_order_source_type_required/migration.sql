/*
  Warnings:

  - Made the column `orderSource` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `orderType` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing NULL rows before enforcing NOT NULL
UPDATE "Order" SET "orderSource" = 'WEB' WHERE "orderSource" IS NULL;
UPDATE "Order" SET "orderType" = 'PICKUP' WHERE "orderType" IS NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "orderSource" SET NOT NULL,
ALTER COLUMN "orderType" SET NOT NULL;
