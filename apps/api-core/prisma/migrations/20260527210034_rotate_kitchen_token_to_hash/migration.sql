-- Tokens existentes quedan invalidados (confirmado: no hay clientes en producción).
-- Cada admin debe regenerar desde /dash/kitchen para obtener el nuevo plain token
-- y reconectar sus pantallas.

-- DropIndex (unique constraint on the plain token no longer applies)
DROP INDEX IF EXISTS "RestaurantSettings_kitchenToken_key";

-- DropColumn
ALTER TABLE "RestaurantSettings" DROP COLUMN "kitchenToken";

-- AddColumn
ALTER TABLE "RestaurantSettings" ADD COLUMN "kitchenTokenHash" TEXT;
