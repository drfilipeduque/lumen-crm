-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Opportunity_stageId_order_idx" ON "Opportunity"("stageId", "order");
