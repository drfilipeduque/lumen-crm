-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'FILE_UPLOADED';
ALTER TYPE "HistoryAction" ADD VALUE 'FILE_DELETED';
ALTER TYPE "HistoryAction" ADD VALUE 'REMINDER_CREATED';
ALTER TYPE "HistoryAction" ADD VALUE 'REMINDER_COMPLETED';
ALTER TYPE "HistoryAction" ADD VALUE 'DESCRIPTION_UPDATED';
