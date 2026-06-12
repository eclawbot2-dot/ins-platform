-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LineOfBusiness" ADD VALUE 'CONDO';
ALTER TYPE "LineOfBusiness" ADD VALUE 'FLOOD';
ALTER TYPE "LineOfBusiness" ADD VALUE 'MOTORCYCLE';
ALTER TYPE "LineOfBusiness" ADD VALUE 'BOAT';
ALTER TYPE "LineOfBusiness" ADD VALUE 'RV';
ALTER TYPE "LineOfBusiness" ADD VALUE 'VALUABLE_ARTICLES';
ALTER TYPE "LineOfBusiness" ADD VALUE 'PET';
ALTER TYPE "LineOfBusiness" ADD VALUE 'IDENTITY_THEFT';
ALTER TYPE "LineOfBusiness" ADD VALUE 'ERRORS_OMISSIONS';
ALTER TYPE "LineOfBusiness" ADD VALUE 'COMMERCIAL_UMBRELLA';
ALTER TYPE "LineOfBusiness" ADD VALUE 'DIRECTORS_OFFICERS';
ALTER TYPE "LineOfBusiness" ADD VALUE 'EPLI';
ALTER TYPE "LineOfBusiness" ADD VALUE 'LIQUOR_LIABILITY';
ALTER TYPE "LineOfBusiness" ADD VALUE 'SURETY_BONDS';
ALTER TYPE "LineOfBusiness" ADD VALUE 'GARAGE';
ALTER TYPE "LineOfBusiness" ADD VALUE 'BUILDERS_RISK';

-- CreateTable
CREATE TABLE "PriorPolicy" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "lineOfBusiness" "LineOfBusiness" NOT NULL,
    "currentCarrier" TEXT,
    "currentPremium" DECIMAL(12,2),
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "limitText" TEXT,
    "limitAmount" DECIMAL(14,2),
    "perOccurrence" DECIMAL(14,2),
    "aggregate" DECIMAL(14,2),
    "deductibleText" TEXT,
    "deductibleAmount" DECIMAL(12,2),
    "premiumPart" DECIMAL(12,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "vin" TEXT,
    "garagingZip" TEXT,
    "usage" TEXT,
    "annualMiles" INTEGER,
    "primaryDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "relationship" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dwelling" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "yearBuilt" INTEGER,
    "construction" TEXT,
    "roofType" TEXT,
    "squareFeet" INTEGER,
    "replacementCost" DECIMAL(14,2),
    "occupancy" TEXT,
    "mortgageeName" TEXT,
    "mortgageeClause" TEXT,
    "loanNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dwelling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledItem" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "appraisalOnFile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watercraft" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "type" TEXT,
    "year" INTEGER,
    "make" TEXT,
    "length" DECIMAL(6,2),
    "hullId" TEXT,
    "motorHp" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watercraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuredLocation" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "buildingValue" DECIMAL(14,2),
    "contentsValue" DECIMAL(14,2),
    "occupancy" TEXT,
    "sqFt" INTEGER,
    "yearBuilt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuredLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriorPolicy_expirationDate_idx" ON "PriorPolicy"("expirationDate");

-- CreateIndex
CREATE INDEX "PriorPolicy_clientId_idx" ON "PriorPolicy"("clientId");

-- CreateIndex
CREATE INDEX "PriorPolicy_leadId_idx" ON "PriorPolicy"("leadId");

-- CreateIndex
CREATE INDEX "Coverage_policyId_idx" ON "Coverage"("policyId");

-- CreateIndex
CREATE INDEX "Vehicle_policyId_idx" ON "Vehicle"("policyId");

-- CreateIndex
CREATE INDEX "Driver_policyId_idx" ON "Driver"("policyId");

-- CreateIndex
CREATE INDEX "Dwelling_policyId_idx" ON "Dwelling"("policyId");

-- CreateIndex
CREATE INDEX "ScheduledItem_policyId_idx" ON "ScheduledItem"("policyId");

-- CreateIndex
CREATE INDEX "Watercraft_policyId_idx" ON "Watercraft"("policyId");

-- CreateIndex
CREATE INDEX "InsuredLocation_policyId_idx" ON "InsuredLocation"("policyId");

-- AddForeignKey
ALTER TABLE "PriorPolicy" ADD CONSTRAINT "PriorPolicy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorPolicy" ADD CONSTRAINT "PriorPolicy_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_primaryDriverId_fkey" FOREIGN KEY ("primaryDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dwelling" ADD CONSTRAINT "Dwelling_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledItem" ADD CONSTRAINT "ScheduledItem_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watercraft" ADD CONSTRAINT "Watercraft_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuredLocation" ADD CONSTRAINT "InsuredLocation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
