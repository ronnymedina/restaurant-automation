-- AlterTable
ALTER TABLE "RestaurantSettings" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'CL',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CLP',
ADD COLUMN     "decimalSeparator" TEXT NOT NULL DEFAULT ',',
ADD COLUMN     "thousandsSeparator" TEXT NOT NULL DEFAULT '.';
