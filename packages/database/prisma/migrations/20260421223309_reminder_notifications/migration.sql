-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "notified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "seenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Reminder_completed_notified_dueAt_idx" ON "Reminder"("completed", "notified", "dueAt");
