-- CreateEnum
CREATE TYPE "TouchpointCategory" AS ENUM ('ONBOARDING', 'RENEWAL', 'PAYMENT', 'CLAIM', 'APPRECIATION', 'SATISFACTION', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "TouchpointChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "TouchpointTrigger" AS ENUM ('RENEWAL_RELATIVE', 'PAYMENT_DUE_RELATIVE', 'BIRTHDAY', 'POLICY_ANNIVERSARY', 'HOLIDAY', 'TENURE_MILESTONE', 'LIFECYCLE_EVENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TouchpointStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "preferredName" TEXT;

-- CreateTable
CREATE TABLE "TouchpointTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TouchpointCategory" NOT NULL,
    "channel" "TouchpointChannel" NOT NULL DEFAULT 'EMAIL',
    "triggerType" "TouchpointTrigger" NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "holidayKey" TEXT,
    "tenureMonths" INTEGER,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audienceFilter" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TouchpointTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTouchpoint" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "channel" "TouchpointChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "TouchpointStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "toAddress" TEXT,
    "renderedSubject" TEXT,
    "renderedBody" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTouchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCommunicationPreferences" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "optOnboarding" BOOLEAN NOT NULL DEFAULT true,
    "optRenewal" BOOLEAN NOT NULL DEFAULT true,
    "optPayment" BOOLEAN NOT NULL DEFAULT true,
    "optClaim" BOOLEAN NOT NULL DEFAULT true,
    "optAppreciation" BOOLEAN NOT NULL DEFAULT true,
    "optSatisfaction" BOOLEAN NOT NULL DEFAULT true,
    "optOffboarding" BOOLEAN NOT NULL DEFAULT true,
    "preferredChannel" "TouchpointChannel" NOT NULL DEFAULT 'EMAIL',
    "quietHoursStart" INTEGER NOT NULL DEFAULT 8,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 20,
    "unsubscribeToken" TEXT NOT NULL,
    "smsConsentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCommunicationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TouchpointTemplate_key_key" ON "TouchpointTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTouchpoint_idempotencyKey_key" ON "ScheduledTouchpoint"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledTouchpoint_clientId_createdAt_idx" ON "ScheduledTouchpoint"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduledTouchpoint_status_scheduledFor_idx" ON "ScheduledTouchpoint"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationPreferences_clientId_key" ON "ClientCommunicationPreferences"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCommunicationPreferences_unsubscribeToken_key" ON "ClientCommunicationPreferences"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "ScheduledTouchpoint" ADD CONSTRAINT "ScheduledTouchpoint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTouchpoint" ADD CONSTRAINT "ScheduledTouchpoint_templateKey_fkey" FOREIGN KEY ("templateKey") REFERENCES "TouchpointTemplate"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTouchpoint" ADD CONSTRAINT "ScheduledTouchpoint_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommunicationPreferences" ADD CONSTRAINT "ClientCommunicationPreferences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
