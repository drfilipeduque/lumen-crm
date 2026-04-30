/*
  Warnings:

  - Added the required column `contactId` to the `CadenceExecution` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "CadenceExecutionStatus" ADD VALUE 'FAILED';

-- DropForeignKey
ALTER TABLE "Cadence" DROP CONSTRAINT "Cadence_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "CadenceExecution" DROP CONSTRAINT "CadenceExecution_opportunityId_fkey";

-- AlterTable
ALTER TABLE "Cadence" ADD COLUMN     "businessDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "businessHoursEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "respectBusinessHours" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "connectionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CadenceExecution" ADD COLUMN     "completedSteps" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "contactId" TEXT NOT NULL,
ADD COLUMN     "pauseReason" TEXT,
ALTER COLUMN "opportunityId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CadenceExecution_contactId_idx" ON "CadenceExecution"("contactId");

-- CreateIndex
CREATE INDEX "CadenceExecution_connectionId_idx" ON "CadenceExecution"("connectionId");

-- AddForeignKey
ALTER TABLE "Cadence" ADD CONSTRAINT "Cadence_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceExecution" ADD CONSTRAINT "CadenceExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceExecution" ADD CONSTRAINT "CadenceExecution_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceExecution" ADD CONSTRAINT "CadenceExecution_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
