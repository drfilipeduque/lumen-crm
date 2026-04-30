-- CreateEnum
CREATE TYPE "WhatsAppRoutingStrategy" AS ENUM ('OFFICIAL_FIRST', 'UNOFFICIAL_FIRST', 'OFFICIAL_ONLY', 'UNOFFICIAL_ONLY');

-- AlterEnum
ALTER TYPE "HistoryAction" ADD VALUE 'TRANSFERRED';

-- CreateTable
CREATE TABLE "WhatsAppRoutingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultConnectionId" TEXT,
    "defaultStrategy" "WhatsAppRoutingStrategy" NOT NULL DEFAULT 'OFFICIAL_FIRST',
    "fallbackTemplateId" TEXT,
    "autoMarkAsRead" BOOLEAN NOT NULL DEFAULT false,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppRoutingConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WhatsAppRoutingConfig" ADD CONSTRAINT "WhatsAppRoutingConfig_defaultConnectionId_fkey" FOREIGN KEY ("defaultConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppRoutingConfig" ADD CONSTRAINT "WhatsAppRoutingConfig_fallbackTemplateId_fkey" FOREIGN KEY ("fallbackTemplateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
