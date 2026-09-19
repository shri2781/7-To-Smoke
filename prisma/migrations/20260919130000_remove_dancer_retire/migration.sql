-- DropIndex
DROP INDEX "Dancer_deletedAt_idx";

-- AlterTable
ALTER TABLE "Dancer" DROP COLUMN "deletedAt";
