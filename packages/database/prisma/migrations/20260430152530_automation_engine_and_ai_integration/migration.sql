-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('CLAUDE', 'OPENAI');

-- AlterEnum
ALTER TYPE "AutomationLogStatus" ADD VALUE 'RUNNING';

-- AlterTable
ALTER TABLE "AutomationLog" ADD COLUMN     "automationId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "steps" JSONB,
ADD COLUMN     "triggeredBy" TEXT;

-- CreateTable
CREATE TABLE "AIIntegration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIIntegration_active_provider_idx" ON "AIIntegration"("active", "provider");

-- CreateIndex
CREATE INDEX "AutomationLog_automationId_startedAt_idx" ON "AutomationLog"("automationId", "startedAt");

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
