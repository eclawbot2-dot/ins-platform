-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('PRIMARY', 'SPOUSE', 'PARTNER', 'CHILD', 'PARENT', 'DEPENDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SurplusLinesStatus" AS ENUM ('PENDING', 'FILED', 'EXEMPT', 'VOID');

-- CreateEnum
CREATE TYPE "CarrierAppetite" AS ENUM ('PREFERRED', 'STANDARD', 'RESTRICTED', 'DECLINE');

-- CreateEnum
CREATE TYPE "SignatureProvider" AS ENUM ('MANUAL', 'DOCUSIGN', 'DROPBOX_SIGN');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignatureDocKind" AS ENUM ('PROPOSAL', 'APPLICATION', 'COI', 'EOI', 'POLICY_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "GroupPlanType" AS ENUM ('GROUP_HEALTH', 'GROUP_DENTAL', 'GROUP_VISION', 'GROUP_LIFE', 'GROUP_DISABILITY', 'GROUP_ACCIDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('PEPM', 'PMPM', 'COMPOSITE', 'AGE_BANDED', 'OTHER');

-- AlterTable
ALTER TABLE "Carrier" ADD COLUMN     "bindingAuthorityLimit" DECIMAL(14,2),
ADD COLUMN     "bindingAuthorityNotes" TEXT,
ADD COLUMN     "uwGuidelinesNotes" TEXT,
ADD COLUMN     "uwGuidelinesUrl" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "hasBenefits" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "householdId" TEXT,
ADD COLUMN     "householdRole" "HouseholdRole" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "primaryClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurplusLinesFiling" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" "SurplusLinesStatus" NOT NULL DEFAULT 'PENDING',
    "filingNumber" TEXT,
    "surplusLinesTax" DECIMAL(12,2),
    "stampingFee" DECIMAL(12,2),
    "taxRatePct" DECIMAL(6,3),
    "diligentSearchDone" BOOLEAN NOT NULL DEFAULT false,
    "affidavitOnFile" BOOLEAN NOT NULL DEFAULT false,
    "filedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurplusLinesFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierAppetiteRow" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "lineOfBusiness" "LineOfBusiness" NOT NULL,
    "appetite" "CarrierAppetite" NOT NULL DEFAULT 'STANDARD',
    "states" TEXT,
    "classNotes" TEXT,
    "minPremium" DECIMAL(12,2),
    "maxPremium" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierAppetiteRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "provider" "SignatureProvider" NOT NULL DEFAULT 'MANUAL',
    "status" "SignatureStatus" NOT NULL DEFAULT 'DRAFT',
    "docKind" "SignatureDocKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "clientId" TEXT,
    "policyId" TEXT,
    "documentPath" TEXT,
    "message" TEXT,
    "envelopeId" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planType" "GroupPlanType" NOT NULL DEFAULT 'GROUP_HEALTH',
    "planName" TEXT NOT NULL,
    "carrierName" TEXT,
    "groupNumber" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "rateBasis" "RateBasis" NOT NULL DEFAULT 'PEPM',
    "monthlyPremium" DECIMAL(12,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Household_name_idx" ON "Household"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SurplusLinesFiling_policyId_key" ON "SurplusLinesFiling"("policyId");

-- CreateIndex
CREATE INDEX "SurplusLinesFiling_status_idx" ON "SurplusLinesFiling"("status");

-- CreateIndex
CREATE INDEX "SurplusLinesFiling_state_idx" ON "SurplusLinesFiling"("state");

-- CreateIndex
CREATE INDEX "CarrierAppetiteRow_lineOfBusiness_idx" ON "CarrierAppetiteRow"("lineOfBusiness");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierAppetiteRow_carrierId_lineOfBusiness_key" ON "CarrierAppetiteRow"("carrierId", "lineOfBusiness");

-- CreateIndex
CREATE INDEX "SignatureRequest_status_idx" ON "SignatureRequest"("status");

-- CreateIndex
CREATE INDEX "SignatureRequest_clientId_idx" ON "SignatureRequest"("clientId");

-- CreateIndex
CREATE INDEX "SignatureRequest_policyId_idx" ON "SignatureRequest"("policyId");

-- CreateIndex
CREATE INDEX "GroupPlan_clientId_idx" ON "GroupPlan"("clientId");

-- CreateIndex
CREATE INDEX "GroupPlan_planType_idx" ON "GroupPlan"("planType");

-- CreateIndex
CREATE INDEX "Client_householdId_idx" ON "Client"("householdId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_primaryClientId_fkey" FOREIGN KEY ("primaryClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurplusLinesFiling" ADD CONSTRAINT "SurplusLinesFiling_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierAppetiteRow" ADD CONSTRAINT "CarrierAppetiteRow_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPlan" ADD CONSTRAINT "GroupPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
