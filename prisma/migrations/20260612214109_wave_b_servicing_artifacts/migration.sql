-- CreateEnum
CREATE TYPE "EoiKind" AS ENUM ('EVIDENCE_OF_PROPERTY', 'EVIDENCE_COMMERCIAL');

-- CreateEnum
CREATE TYPE "EoiHolderInterest" AS ENUM ('MORTGAGEE', 'LOSS_PAYEE', 'ADDITIONAL_INTEREST', 'LENDER');

-- CreateEnum
CREATE TYPE "EndorsementRequestType" AS ENUM ('ADD_VEHICLE', 'REMOVE_VEHICLE', 'ADD_DRIVER', 'REMOVE_DRIVER', 'CHANGE_LIMIT', 'ADD_LIENHOLDER', 'REMOVE_LIENHOLDER', 'ADDRESS_CHANGE', 'ADD_COVERAGE', 'REMOVE_COVERAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "EndorsementRequestStatus" AS ENUM ('REQUESTED', 'IN_REVIEW', 'SUBMITTED_TO_CARRIER', 'COMPLETED', 'DECLINED');

-- CreateEnum
CREATE TYPE "EndorsementRequestSource" AS ENUM ('STAFF', 'PORTAL');

-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'EOI';

-- CreateTable
CREATE TABLE "EvidenceOfProperty" (
    "id" TEXT NOT NULL,
    "eoiNumber" TEXT NOT NULL,
    "kind" "EoiKind" NOT NULL DEFAULT 'EVIDENCE_OF_PROPERTY',
    "clientId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "propertyAddress" TEXT,
    "coverageALimit" DECIMAL(14,2),
    "deductibleText" TEXT,
    "holderName" TEXT NOT NULL,
    "holderInterest" "EoiHolderInterest" NOT NULL DEFAULT 'MORTGAGEE',
    "holderAddress" TEXT,
    "loanNumber" TEXT,
    "remarks" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,

    CONSTRAINT "EvidenceOfProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndorsementRequest" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "requestType" "EndorsementRequestType" NOT NULL DEFAULT 'OTHER',
    "status" "EndorsementRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "EndorsementRequestSource" NOT NULL DEFAULT 'STAFF',
    "summary" TEXT NOT NULL,
    "payload" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "notes" TEXT,
    "requestedById" TEXT,
    "processedById" TEXT,
    "endorsementId" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndorsementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reinstatement" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "reinstatedAt" TIMESTAMP(3) NOT NULL,
    "lapseDays" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "lapseHandling" TEXT,
    "reinstatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reinstatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceOfProperty_eoiNumber_key" ON "EvidenceOfProperty"("eoiNumber");

-- CreateIndex
CREATE INDEX "EvidenceOfProperty_clientId_idx" ON "EvidenceOfProperty"("clientId");

-- CreateIndex
CREATE INDEX "EvidenceOfProperty_policyId_idx" ON "EvidenceOfProperty"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "EndorsementRequest_endorsementId_key" ON "EndorsementRequest"("endorsementId");

-- CreateIndex
CREATE INDEX "EndorsementRequest_status_idx" ON "EndorsementRequest"("status");

-- CreateIndex
CREATE INDEX "EndorsementRequest_policyId_idx" ON "EndorsementRequest"("policyId");

-- CreateIndex
CREATE INDEX "Reinstatement_policyId_idx" ON "Reinstatement"("policyId");

-- AddForeignKey
ALTER TABLE "EvidenceOfProperty" ADD CONSTRAINT "EvidenceOfProperty_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceOfProperty" ADD CONSTRAINT "EvidenceOfProperty_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceOfProperty" ADD CONSTRAINT "EvidenceOfProperty_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndorsementRequest" ADD CONSTRAINT "EndorsementRequest_endorsementId_fkey" FOREIGN KEY ("endorsementId") REFERENCES "Endorsement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reinstatement" ADD CONSTRAINT "Reinstatement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reinstatement" ADD CONSTRAINT "Reinstatement_reinstatedById_fkey" FOREIGN KEY ("reinstatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
