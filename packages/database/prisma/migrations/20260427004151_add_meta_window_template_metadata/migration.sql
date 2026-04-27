-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'TEMPLATE';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "windowExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "metadata" JSONB;
