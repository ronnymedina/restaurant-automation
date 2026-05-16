/*
  Warnings:

  - You are about to drop the column `isDefault` on the `product_categories` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderSource" TEXT,
ADD COLUMN     "orderType" TEXT,
ADD COLUMN     "tableNumber" TEXT;

-- AlterTable
ALTER TABLE "product_categories" DROP COLUMN "isDefault";
